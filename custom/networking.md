# 网络与上传

> 本机出网经过 `127.0.0.1:10808`（HTTP 与 SOCKS5 同端口）。**向服务器上传文件必须走代理**，直连明显更慢。

## 代理

| 用途 | 写法 |
|---|---|
| HTTP(S) 下载/探测 | `curl -x http://127.0.0.1:10808 ...` |
| SSH / scp / rsync | `-o ProxyCommand='nc -X 5 -x 127.0.0.1:10808 %h %p'`（SOCKS5） |

`nc -X connect`（HTTP CONNECT）实测**不通**，只用 SOCKS5。

## 上传实测（2026-11-02，目标 87.107.108.14）

| 方式 | 60 MB | 备注 |
|---|---|---|
| 直连 | 45 s（1.33 MB/s） | |
| SOCKS5 代理 | 28 s（2.14 MB/s） | 快约 61% |

对照：256 MB 安装包直连上传耗时 **13 分 12 秒**（约 0.32 MB/s），远慢于上面测得的直连速度，链路抖动很大。结论不变：**大文件一律走代理**。

```bash
# scp
scp -o ProxyCommand='nc -X 5 -x 127.0.0.1:10808 %h %p' \
  -i ~/.ssh/id_ed25519 file root@87.107.108.14:/dest/

# rsync（两个 `-e` 参数要一起给）
rsync -az --progress \
  -e "ssh -o ProxyCommand='nc -X 5 -x 127.0.0.1:10808 %h %p' -i $HOME/.ssh/id_ed25519" \
  site/dist/fa/ root@87.107.108.14:/var/www/fa-site/
```

## 出网探测的两个坑

1. `nc -z -X 5 -x 127.0.0.1:10808 <host> <port>` **不可信**：对关闭端口（如 `:1`）也会报 succeeded。端口可达性要用真实连接验证（`ssh -o ConnectTimeout`、`curl --max-time`）。
2. 直连会被部分目的地静默丢包（实测 `8.8.8.8:443`、`1.1.1.1:443` 超时，而 `1.1.1.1:53`、`github.com:22` 可达）。判断"服务器挂了"之前先经代理复测，避免把链路问题当成宕机。

## 大文件约定

- 先传成 `<name>.part`，校验 sha256 后再 `mv` 到正式名；直接覆盖正式名会让用户在传输中途下载到半截文件
- 传完在服务器上 `sha256sum` 比对本地值，再更新站点里的 `sha256` 字段

## 上传目标（2026-11-03）

| 用途 | 主机 | 目录 | 公网路径 |
|---|---|---|---|
| FA 官网 | `root@87.107.108.14` | `/var/www/fa-site/` | `https://www.deepseekfa.com/` |
| FA 安装包 | 同上 | `/var/www/fa-site/downloads/` | `/downloads/<file>` |
| FA 迷你控制台 | 同上 | `/var/www/fa-console/me/` | `https://deepseekfa.com/me/` |
| RU 官网 | `root@104.248.155.54` | `/var/www/ru-site/` | `https://www.deepseek-ru.org/` |
| RU 安装包 | 同上 | `/opt/dsh-gateway-ru/downloads/` | `/downloads/<file>`（nginx alias，**不是** `/var/www/ru-site/downloads`） |
| RU 迷你控制台 | 同上 | `/var/www/ru-console/me/` | `https://deepseek-ru.org/me/` |

Windows 构建机的公钥 `deepseek-fa-2dev`（ED25519，`SHA256:AGrgJtmBuqFar+EA04AqvrsVHtLUoAsxlE2nDGe/ZPo`）已加入两台服务器的 `root`，供它直接 scp 上传安装包；细节见 [windows-handoff.md](windows-handoff.md)。
