/**
 * Generate the Russian language pack from an upstream release.
 *
 * Reads our own client packages to learn which namespace each dictionary file
 * owns, pulls the matching `ru` dictionary from a pinned upstream git ref, and
 * writes `packages/client/locale-ru/src/client/dicts.ts`. Upstream keeps these
 * translations unreleased between tags, so the ref is explicit and recorded in
 * the generated file.
 *
 * Usage: node custom/scripts/extract-locale-ru.mjs [ref]
 */

import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const ts = require('typescript')

const REF = process.argv[2] ?? 'dsh-v0.2.2-alpha.2'
/** Fork product name substituted for upstream's own name in user-facing copy; command and path tokens stay verbatim. */
const BRAND = 'DeepSeek-RU'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = path.join(ROOT, 'packages/client/locale-ru/src/client/dicts.ts')

/** Upstream file text cache, keyed by repository path. */
const upstreamCache = new Map()

/** Read one repository-relative path at the pinned ref. @param file - repository path. @returns file text, or undefined when the ref lacks it. */
function upstreamFile(file) {
  if (upstreamCache.has(file)) return upstreamCache.get(file)
  let text
  try {
    text = execFileSync('git', ['show', `${REF}:${file}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  } catch {
    text = undefined
  }
  upstreamCache.set(file, text)
  return text
}

/** Recursively list TypeScript sources under one directory, skipping build output. @param dir - directory to walk. @param out - accumulator. @returns collected paths. */
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'lib' || entry === 'tests') continue
    const file = path.join(dir, entry)
    const stat = statSync(file)
    if (stat.isDirectory()) walk(file, out)
    else if (file.endsWith('.ts') && !file.endsWith('.d.ts')) out.push(file)
  }
  return out
}

/** Relative specifiers imported by one source file. @param sf - parsed source. @returns local name to binding. */
function importBindings(sf) {
  const bindings = new Map()
  for (const statement of sf.statements) {
    if (!ts.isImportDeclaration(statement)) continue
    const specifier = statement.moduleSpecifier.text
    if (!specifier.startsWith('.')) continue
    const clause = statement.importClause
    if (!clause) continue
    if (clause.name) bindings.set(clause.name.text, { specifier, imported: 'default' })
    const named = clause.namedBindings
    if (named && ts.isNamedImports(named)) {
      for (const element of named.elements) {
        bindings.set(element.name.text, { specifier, imported: element.propertyName?.text ?? element.name.text })
      }
    }
  }
  return bindings
}

/** Resolve a relative import specifier to a repository-relative path. @param from - repository-relative importer. @param specifier - relative specifier. @returns repository-relative target. */
function resolveSpecifier(from, specifier) {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier))
  return base.endsWith('.ts') ? base : `${base}.ts`
}

/** Demand-driven module scope: evaluates only declarations a lookup actually reaches. */
class ModuleScope {
  #file
  #upstream
  #seen
  #sf
  #bindings
  #declarations
  #values = new Map()

  /**
   * @param file - repository-relative module.
   * @param upstream - read the pinned ref instead of the worktree copy.
   * @param seen - module recursion guard shared by one evaluation.
   */
  constructor(file, upstream, seen) {
    this.#file = file
    this.#upstream = upstream
    this.#seen = seen
    const text = upstream ? upstreamFile(file) : readFileSync(path.join(ROOT, file), 'utf8')
    if (text === undefined) throw new Error(`missing module ${file} at ${REF}`)
    this.#sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    this.#bindings = importBindings(this.#sf)
    this.#declarations = new Map()
    for (const statement of this.#sf.statements) {
      if (!ts.isVariableStatement(statement)) continue
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer) {
          this.#declarations.set(declaration.name.text, declaration.initializer)
        }
      }
    }
  }

  /**
   * Read one export.
   * @param name - exported or local name.
   * @returns evaluated value.
   */
  get(name) {
    if (this.#values.has(name)) return this.#values.get(name)
    const initializer = this.#declarations.get(name)
    if (initializer) {
      const value = this.#evaluate(initializer)
      this.#values.set(name, value)
      return value
    }
    const binding = this.#bindings.get(name)
    if (!binding) return undefined
    const key = `${this.#upstream ? 'up' : 'local'}:${this.#file}#${name}`
    if (this.#seen.has(key)) return undefined
    this.#seen.add(key)
    const target = resolveSpecifier(this.#file, binding.specifier)
    const value = new ModuleScope(target, this.#upstream, this.#seen).get(binding.imported)
    this.#values.set(name, value)
    return value
  }

  /** Evaluate one expression as data. @param node - expression node. @returns string, number, or plain object. */
  #evaluate(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
    if (ts.isNumericLiteral(node)) return Number(node.text)
    if (ts.isIdentifier(node)) {
      const value = this.get(node.text)
      if (value === undefined) throw new Error(`unresolved identifier ${node.text} in ${this.#file}`)
      return value
    }
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
      const owner = this.get(node.expression.text)
      if (owner && typeof owner === 'object' && node.name.text in owner) return owner[node.name.text]
      throw new Error(`unresolved property ${node.getText(this.#sf)} in ${this.#file}`)
    }
    if (ts.isAsExpression(node) || ts.isParenthesizedExpression(node)
      || ts.isSatisfiesExpression(node) || ts.isTypeAssertionExpression(node)) return this.#evaluate(node.expression)
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = this.#evaluate(node.left)
      const right = this.#evaluate(node.right)
      return typeof left === 'number' && typeof right === 'number' ? left + right : String(left) + String(right)
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'join' && node.arguments.length <= 1) {
      const items = this.#evaluate(node.expression.expression)
      if (!Array.isArray(items)) throw new Error(`join on non-array in ${this.#file}`)
      const separator = node.arguments.length ? this.#evaluate(node.arguments[0]) : ','
      return items.map(item => String(item)).join(String(separator))
    }
    if (ts.isArrayLiteralExpression(node)) return node.elements.map(element => this.#evaluate(element))
    if (ts.isObjectLiteralExpression(node)) {
      const out = {}
      for (const property of node.properties) {
        if (ts.isPropertyAssignment(property)) {
          const name = ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)
            ? property.name.text
            : property.name.getText(this.#sf)
          out[name] = this.#evaluate(property.initializer)
        } else if (ts.isSpreadAssignment(property)) {
          const spread = this.#evaluate(property.expression)
          if (!spread || typeof spread !== 'object') throw new Error(`non-object spread in ${this.#file}`)
          Object.assign(out, spread)
        } else if (ts.isShorthandPropertyAssignment(property)) {
          const value = this.get(property.name.text)
          if (value === undefined) throw new Error(`unresolved shorthand ${property.name.text} in ${this.#file}`)
          out[property.name.text] = value
        } else {
          throw new Error(`unsupported property ${property.getText(this.#sf)} in ${this.#file}`)
        }
      }
      return out
    }
    throw new Error(`unsupported expression (${ts.SyntaxKind[node.kind]}) ${node.getText(this.#sf).slice(0, 60)} in ${this.#file}`)
  }
}

/** Resolve a namespace expression to its string value. @param file - registration site. @param node - first register argument. @param bindings - imports of the site. @returns namespace or undefined. */
function resolveNamespace(file, node, bindings) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (!ts.isIdentifier(node)) return undefined
  const value = new ModuleScope(file, false, new Set()).get(node.text)
  return typeof value === 'string' ? value : undefined
}

/** Map local dictionary identifiers to the upstream export that holds their Russian copy. @param zhName - imported English-source name. @returns upstream export name. */
function russianExportName(zhName) {
  return zhName === 'zh' ? 'ru' : zhName.replace(/Zh$/u, 'Ru')
}

/** Collect namespace → owning dictionary file from our client packages. @returns one entry per registered namespace. */
function discoverNamespaces() {
  const found = new Map()
  for (const packageDir of readdirSync(path.join(ROOT, 'packages/client'))) {
    const clientDir = path.join(ROOT, 'packages/client', packageDir, 'src/client')
    let files
    try {
      files = walk(clientDir)
    } catch {
      continue
    }
    for (const absolute of files) {
      const file = path.relative(ROOT, absolute).split(path.sep).join('/')
      const text = readFileSync(absolute, 'utf8')
      if (!text.includes('.locale.register(')) continue
      const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
      const bindings = importBindings(sf)
      const visit = (node) => {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
          && node.expression.name.text === 'register'
          && node.expression.expression.getText(sf).endsWith('locale')
          && node.arguments.length >= 2 && ts.isObjectLiteralExpression(node.arguments[1])) {
          const [namespaceNode, dictionaries] = node.arguments
          let namespace
          try {
            namespace = resolveNamespace(file, namespaceNode, bindings)
          } catch (error) {
            console.error(`namespace unresolved: ${file}: ${error.message}`)
            return
          }
          if (namespace === undefined) return
          for (const property of dictionaries.properties) {
            const langName = ts.isPropertyAssignment(property)
              ? (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) ? property.name.text : undefined)
              : ts.isShorthandPropertyAssignment(property) ? property.name.text : undefined
            if (langName !== 'zh' && langName !== 'en') continue
            const valueNode = ts.isPropertyAssignment(property) ? property.initializer : property.name
            if (!ts.isIdentifier(valueNode)) continue
            const binding = bindings.get(valueNode.text)
            const target = binding ? resolveSpecifier(file, binding.specifier) : file
            const importedName = binding ? binding.imported : valueNode.text
            const entry = found.get(namespace) ?? { site: file }
            entry.file = target
            entry[langName === 'zh' ? 'zhName' : 'enName'] = importedName
            found.set(namespace, entry)
          }
        }
        ts.forEachChild(node, visit)
      }
      visit(sf)
    }
  }
  return found
}


/** Quote one string as a lint-conforming literal. @param value - raw string. @returns source text. */
function quote(value) {
  if (value.includes("'") && !value.includes('"')) return JSON.stringify(value)
  return "'" + value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/[\u0000-\u001f\u2028\u2029]/g, character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`)
    + "'"
}

const namespaces = discoverNamespaces()
const dicts = {}
const sources = {}
const missing = []
const skipped = []

for (const [namespace, entry] of [...namespaces].sort((a, b) => a[0].localeCompare(b[0]))) {
  const ruName = russianExportName(entry.zhName)
  let dict
  try {
    dict = new ModuleScope(entry.file, true, new Set()).get(ruName)
  } catch (error) {
    skipped.push(`${namespace} (${entry.file}): ${error.message}`)
    continue
  }
  if (!dict || typeof dict !== 'object') {
    missing.push(`${namespace}: ${ruName} absent in ${entry.file}`)
    continue
  }
  dicts[namespace] = Object.fromEntries(Object.entries(dict).map(([key, value]) => [
    key,
    typeof value === 'string' ? value.split('DeepSeek Harness').join(BRAND) : value,
  ]))
  sources[namespace] = { file: entry.file, enName: entry.enName ?? 'en' }
}

const dictBody = Object.entries(dicts).map(([namespace, dict]) => {
  const entries = Object.entries(dict)
    .map(([key, value]) => `    ${quote(key)}: ${quote(value)},`)
    .join('\n')
  return `  ${quote(namespace)}: {\n${entries}\n  },`
}).join('\n')

const sourceBody = Object.entries(sources)
  .map(([namespace, entry]) => `  ${quote(namespace)}: { file: ${quote(entry.file)}, en: ${quote(entry.enName ?? 'en')} },`)
  .join('\n')

const header = `/**
 * Russian dictionaries, generated from upstream \`${REF}\`.
 *
 * Regenerate with \`node custom/scripts/extract-locale-ru.mjs\` after merging a
 * newer upstream tag; do not edit the dictionaries by hand. \`RU_SOURCES\` names
 * the repository file that owns each namespace's English dictionary, which the
 * coverage test reads to detect missing or stale keys.
 */

/** Upstream ref these dictionaries came from. */
export const RU_LOCALE_REF = ${quote(REF)}

/** Namespace to Russian dictionary, keyed the same way each package keys its own. */
export const RU_DICTS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
${dictBody}
}

/** Namespace to the repository file that owns its English dictionary and that dictionary's export name. */
export const RU_SOURCES: Readonly<Record<string, { file: string; en: string }>> = {
${sourceBody}
}
`

mkdirSync(path.dirname(OUT), { recursive: true })
writeFileSync(OUT, header)

const keys = Object.values(dicts).reduce((sum, dict) => sum + Object.keys(dict).length, 0)
console.log(`ref=${REF} namespaces=${Object.keys(dicts).length} keys=${keys}`)
if (missing.length) console.log(`missing ru (${missing.length}):\n  ${missing.join('\n  ')}`)
if (skipped.length) console.log(`skipped (${skipped.length}):\n  ${skipped.join('\n  ')}`)
