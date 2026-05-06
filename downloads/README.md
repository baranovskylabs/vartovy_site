# Vartovy — публічні білди

Тут лежать офіційні Windows-збірки Vartovy, що віддаються з сайту.

## Як додати нову версію

1. Покладіть бінарник у цю теку, наприклад: `Vartovy-1.1.0-x64-Portable.exe`.
2. Обчисліть SHA-256:
   ```powershell
   Get-FileHash .\Vartovy-1.1.0-x64-Portable.exe -Algorithm SHA256
   ```
3. Додайте новий запис у [`releases.json`](./releases.json) (на початок масиву `releases`)
   та оновіть поля `latest` і `channels.stable`.
4. Сторінки `/pages/download.html` і `/pages/versions.html` підхопляться автоматично —
   вони читають `releases.json` під час завантаження.

## Поточний стан

| Версія  | Тип      | Розмір   | SHA-256 (перші 16) | Дата       |
|---------|----------|----------|--------------------|------------|
| 1.0.0   | Portable | 95.3 MB  | `1E699FC5F8824877` | 2026-05-06 |

> **Увага.** Великі бінарники (≥ 50 MB) краще тримати у Git LFS або на зовнішньому
> CDN (Cloudflare R2, GitHub Releases). Якщо ви розгортаєте на Cloudflare Pages,
> файли > 25 MB повинні віддаватись через R2 + Worker, інакше білд буде відхилений.
