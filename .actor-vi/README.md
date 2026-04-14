# Threads Scraper — Bài viết, Hồ sơ, Hashtag & Tìm kiếm từ khóa

Một scraper Meta Threads hợp nhất cho **hồ sơ người dùng**, **hashtag / chủ đề**, **tìm kiếm từ khóa**, **bài viết đơn lẻ kèm phản hồi**, và **feed tùy chỉnh**. Không cần đăng nhập, không cần API token, hỗ trợ dán hàng loạt tối đa 100 username hoặc từ khóa mỗi lần, giá cố định **$0.005 mỗi kết quả** không phí khởi động. Dành cho marketer, researcher, developer SaaS và đội social listening cần dữ liệu Threads mà không muốn tích hợp API chính thức của Meta.

---

## Scraper này trích xuất những gì

Với mỗi bài viết:

- `postId`, `postUrl`, `content`, `publishedAt`, `publishedAtISO`
- `mediaType` (`text` / `photo` / `video` / `carousel`) và `mediaUrls[]`
- Tương tác: `likeCount`, `replyCount`, `repostCount`, `shareCount`, `viewCount`, `quoteCount`
- `sourceType` (chế độ nào đã tạo ra kết quả) và `sourceQuery` (username / từ khóa / URL chính xác)
- Timestamp `scrapedAt`
- `threadParts[]` — bài viết thread nhiều phần được gộp tự động, mỗi phần được giữ nguyên

Với tác giả:

- Handle `author`

Với phản hồi (chỉ trong chế độ `post`):

- `replies[]` — tối đa 20 phản hồi hàng đầu với `author`, `content`, `publishedAt`, `likeCount`

Tên field trong dataset là tiếng Anh ở tất cả các locale — tooling downstream vẫn portable.

---

## Năm chế độ, một actor

| Chế độ | Chức năng | Trường input |
|--------|-----------|--------------|
| 👤 **User** | Scrape tất cả bài viết từ hồ sơ của một user | `usernames[]` |
| 🏷️ **Hashtag** | Scrape trang hashtag / chủ đề | `keywords[]` |
| 🔎 **Search** | Tìm kiếm từ khóa với sắp xếp Top / Mới nhất | `keywords[]` + `searchSort` |
| 💬 **Post** | Bài viết đơn với tối đa 20 phản hồi hàng đầu | `postUrls[]` |
| 📰 **Feed** | Bất kỳ URL feed tùy chỉnh Threads nào | `feedUrls[]` |

Chọn một chế độ mỗi lần chạy từ dropdown **Mode**. Các scraper đối thủ chia các chế độ này thành 4–5 actor riêng — scraper này giữ tất cả trong một codebase duy nhất để tích hợp của bạn đơn giản hơn.

---

## Input

| Trường | Kiểu | Bắt buộc | Mặc định | Mô tả |
|--------|------|:--------:|:--------:|-------|
| `mode` | enum | khuyến nghị | `user` | Một trong `user`, `hashtag`, `search`, `post`, `feed`. Nếu bỏ trống, tự động phát hiện từ trường nào bạn điền. |
| `usernames` | string[] | cho chế độ `user` | — | Username thuần, không `@`, không URL. Tối đa **100** mỗi lần. |
| `bulkUsernames` | string | tùy chọn | — | Textarea — dán một username mỗi dòng (copy cột từ spreadsheet trực tiếp). Gộp vào `usernames`. |
| `keywords` | string[] | cho `hashtag` / `search` | — | Từ khóa hoặc hashtag (dấu `#` đầu tùy chọn). Tối đa **100** mỗi lần. |
| `bulkKeywords` | string | tùy chọn | — | Textarea để dán từ khóa. Gộp vào `keywords`. |
| `postUrls` | string[] | cho chế độ `post` | — | URL đầy đủ của bài viết Threads — phản hồi được scrape tự động. |
| `feedUrls` | string[] | cho chế độ `feed` | — | URL feed tùy chỉnh của Threads. |
| `searchSort` | enum | tùy chọn | `top` | `top` hoặc `recent`. Chỉ áp dụng cho chế độ `search`. |
| `dateFrom` | string | tùy chọn | — | `YYYY-MM-DD` **hoặc** tương đối: `7 days`, `1 month`, `2 weeks`, `1 year`. |
| `dateTo` | string | tùy chọn | — | Cùng định dạng với `dateFrom`. |
| `maxPosts` | integer | tùy chọn | `50` | Số bài tối đa trên mỗi nguồn, 1–500. Cuộn trang được quản lý tự động. |

---

## Ví dụ sử dụng

**👤 Scrape ba hồ sơ người dùng**

```json
{
  "mode": "user",
  "usernames": ["zuck", "mosseri", "finkd"],
  "maxPosts": 50
}
```

**🏷️ Scrape một hashtag trong tháng qua**

```json
{
  "mode": "hashtag",
  "keywords": ["#TinAI"],
  "dateFrom": "1 month",
  "maxPosts": 200
}
```

**🔎 Tìm kiếm từ khóa, bài viết mới nhất trong 7 ngày qua**

```json
{
  "mode": "search",
  "keywords": ["LLM agent", "vibe coding"],
  "searchSort": "recent",
  "dateFrom": "7 days",
  "maxPosts": 100
}
```

**💬 Bài viết đơn + phản hồi hàng đầu**

```json
{
  "mode": "post",
  "postUrls": ["https://www.threads.com/@zuck/post/ABC123"]
}
```

**📋 Dán hàng loạt — 80 tài khoản KOL từ một spreadsheet**

Copy một cột trực tiếp từ Google Sheets / Excel và dán vào `bulkUsernames` — không cần bấm "Thêm" 80 lần.

**Định dạng trong Console: một username mỗi dòng, nhấn Enter giữa các dòng — không dấu nháy, không dấu phẩy.** Như này:

```
zuck
mosseri
finkd
threadsapp
taylornikolai
```

Nếu bạn gọi API thay vì dùng Console, `bulkUsernames` là một string duy nhất với `\n` làm ký tự phân tách dòng:

```json
{
  "mode": "user",
  "bulkUsernames": "zuck\nmosseri\nfinkd\nthreadsapp\ntaylornikolai",
  "maxPosts": 20
}
```

---

## Lưu ý và giới hạn

- **`maxPosts` là trần, không phải đảm bảo.** Các hồ sơ không hoạt động hoặc hashtag nhỏ có thể trả về ít bài hơn. Scraper dừng sớm sau 5 lần cuộn liên tiếp không có kết quả mới thay vì lãng phí thời gian.
- **Ngày tương đối được tính lúc chạy.** `"7 days"` hôm nay và ngày mai cho ra ngày tuyệt đối khác nhau — hữu ích cho các lần chạy theo lịch luôn lấy "tuần vừa qua".
- **Số liệu tương tác có thể là ước tính.** Threads viết tắt số lớn (ví dụ `12.5K`) — actor chuẩn hóa về số nguyên, nên `12500` là giá trị đã chuyển đổi, không phải con số chính xác.
- **Phản hồi chỉ được scrape trong chế độ `post`**, giới hạn ở ~20 phản hồi hàng đầu đầu tiên mỗi bài.
- **Không đăng nhập = chỉ dữ liệu công khai.** Tài khoản riêng tư và nội dung chỉ-cho-follower không truy cập được.
- **Chuỗi thread được gộp tự động.** Bài viết nhiều phần (`1/`, `2/`, `3/`) được kết hợp thành một record duy nhất qua `threadParts[]`.

---

## FAQ

**H: Tôi phải truyền username thế nào? Có `@` hay không, URL đầy đủ hay thuần?**
Thuần là chuẩn: `zuck`, không phải `@zuck` hay `https://www.threads.com/@zuck`. Dấu `@` đầu được tự động loại bỏ, và trường `profileUrls` cũ từ v0.3 được tự động migrate — các tích hợp API hiện có không bị hỏng.

**H: Tôi nhận được kết quả không đầy đủ — ít bài hơn `maxPosts`. Tại sao?**
Hoặc hồ sơ thực sự có ít bài hơn, hoặc hashtag là nhỏ, hoặc feed Threads dừng trả về items mới sau nhiều lần cuộn. Kiểm tra `totalItems` trong log run — đó là số thực tế.

**H: Một số trường là `null` hoặc `0`. Lỗi không?**
Threads render số liệu tương tác theo kiểu lazy. Đặc biệt lượt xem chỉ xuất hiện trên các tài khoản có đủ reach công khai; lượt trích dẫn phụ thuộc vào loại bài. Trường thiếu là khoảng trống dữ liệu ở Threads, không phải lỗi silent của actor.

**H: `dateFrom` / `dateTo` có áp dụng cho chế độ `user` và `post` không?**
Bộ lọc ngày chạy trên mọi chế độ, nhưng chỉ có ý nghĩa với `search`, `hashtag`, `user`, và `feed` — chế độ `post` scrape các URL cụ thể bất kể ngày tháng. Các biểu thức tương đối như `"1 month"` được resolve về `YYYY-MM-DD` tuyệt đối trước khi lọc.

**H: Những định dạng output nào được hỗ trợ?**
JSON, CSV, Excel, XML, bảng HTML — các export dataset Apify tiêu chuẩn. Có sẵn qua Apify Console, dataset API, hoặc các client library Apify (Python, JavaScript). Cũng tích hợp với Zapier, Make, n8n, và Google Sheets.

---

## Giải pháp thay thế: API Threads chính thức

Meta công bố [API Threads chính thức](https://developers.facebook.com/docs/threads), nhưng nó có các ràng buộc khắt khe cho các use case dữ liệu công khai:

- Chỉ đọc dữ liệu từ các tài khoản bạn sở hữu hoặc đã cấp quyền — không giám sát đối thủ, không research trend, không scrape hashtag
- Yêu cầu thiết lập OAuth, review app cho công cụ publishing, và tài khoản Facebook Developer
- Giới hạn rate và phạm vi endpoint hẹp hơn những gì một trình duyệt logout có thể thấy

Cho nghiên cứu thị trường, social listening, phân tích trend, và tình báo cạnh tranh trên dữ liệu công khai của Threads, actor này là con đường đơn giản hơn. Để đăng bài, quản lý tài khoản của bạn, hoặc xây dựng automation trên các tài khoản được ủy quyền, hãy dùng API chính thức của Meta.

---

## Tuyên bố miễn trừ

Scraper này chỉ thu thập dữ liệu Threads được hiển thị công khai. Nó không truy cập tài khoản riêng tư, không vượt qua xác thực, và không trích xuất thông tin cá nhân ngoài những gì một người truy cập không đăng nhập có thể thấy. Người dùng chịu trách nhiệm đảm bảo use case của mình tuân thủ luật hiện hành (GDPR, CCPA, các quy định bảo vệ dữ liệu địa phương) và Điều khoản dịch vụ của Meta. Dùng công cụ này cho research hợp pháp, giám sát, và analytics — không dùng cho spam, quấy rối, hoặc bán lại dữ liệu trái phép.

---

*Threads scraper · giải pháp thay thế API Meta Threads · bài viết Threads · Threads hashtag scraper · tìm kiếm từ khóa Threads · scraper hồ sơ Threads · phản hồi Threads · feed tùy chỉnh Threads · social listening · brand monitoring · competitive intelligence · theo dõi KOL · influencer analytics · dữ liệu marketing*
