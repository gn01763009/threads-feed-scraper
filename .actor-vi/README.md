# 🚀 Threads Scraper — Lấy dữ liệu bài viết, hồ sơ, hashtag & tìm kiếm từ khóa

🔥 Thu thập dữ liệu Threads chỉ trong vài phút — **không cần đăng nhập / API key**.

Một công cụ **all-in-one** giúp bạn thu thập dữ liệu Threads một cách nhanh chóng và dễ dàng: 

* 👤 Hồ sơ người dùng
* 🏷️ Hashtag / chủ đề
* 🔎 Tìm kiếm từ khóa
* 💬 Bài viết + phản hồi
* 📰 Feed tùy chỉnh

👉 Hỗ trợ batch lên đến **100 username hoặc keyword mỗi lần**
👉 Trải nghiệm miễn phí
👉 Chỉ $0.005 / mỗi kết quả 

Phù hợp cho: marketer, researcher, developer SaaS, team social listening và data analytics.

---

## 📦 Dữ liệu bạn nhận được

### 📝 Với mỗi bài viết

* `postId`, `postUrl`, `content`
* `publishedAt`, `publishedAtISO`
* `mediaType` (`text`, `photo`, `video`, `carousel`)
* `mediaUrls[]`
* Chỉ số tương tác:

  * `likeCount`
  * `replyCount`
  * `repostCount`
  * `shareCount`
  * `viewCount` — luôn bằng `0`; Threads không cung cấp lượt xem cho người dùng chưa đăng nhập
  * `quoteCount`
* `sourceType`, `sourceQuery`
* `scrapedAt`
* `threadParts[]` (tự động gộp thread nhiều phần)

---

### 👤 Với tác giả

* `author`

---

### 💬 Với phản hồi (mode `post`)

* `replies[]` — tối đa 20 phản hồi hàng đầu

👉 Tất cả field đều bằng tiếng Anh → dễ dàng tích hợp vào pipeline và các công cụ downstream

---

## ⚙️ 5 chế độ — 1 tool duy nhất

| Mode        | Mô tả                          | Input                       |
| ----------- | ------------------------------ | --------------------------- |
| 👤 User     | Lấy bài từ hồ sơ user          | `usernames[]`               |
| 🏷️ Hashtag | Lấy dữ liệu từ hashtag / topic | `keywords[]`                |
| 🔎 Search   | Tìm bài theo keyword           | `keywords[]` + `searchSort` |
| 💬 Post     | Lấy 1 bài + replies            | `postUrls[]`                |
| 📰 Feed     | Lấy từ feed bất kỳ             | `feedUrls[]`                |

👉 Không cần dùng nhiều công cụ scraper khác — tất cả trong một công cụ duy nhất.

---

## 📥 Input

| Trường          | Kiểu     | Bắt buộc       | Mặc định | Mô tả                                          |
| --------------- | -------- | -------------- | -------- | ---------------------------------------------- |
| `mode`          | enum     | khuyến nghị    | `user`   | `user`, `hashtag`, `search`, `post`, `feed`    |
| `usernames`     | string[] | user mode      | —        | Username (không cần `@`)                       |
| `bulkUsernames` | string   | optional       | —        | Dán danh sách username (mỗi dòng một username) |
| `keywords`      | string[] | hashtag/search | —        | Từ khóa hoặc hashtag                           |
| `bulkKeywords`  | string   | optional       | —        | Dán keyword hàng loạt                          |
| `postUrls`      | string[] | post mode      | —        | URL bài Threads                                |
| `feedUrls`      | string[] | feed mode      | —        | URL feed                                       |
| `searchSort`    | enum     | optional       | `top`    | `top` hoặc `recent`                            |
| `dateFrom`      | string   | optional       | —        | `YYYY-MM-DD` hoặc `7 days`, `1 month`          |
| `dateTo`        | string   | optional       | —        | giống `dateFrom`                               |
| `maxPosts`      | number   | optional       | `50`     | Số bài tối đa / nguồn                          |

---

## 🔥 Ví dụ sử dụng

### 👤 Scrape user

```json
{
  "mode": "user",
  "usernames": ["zuck", "mosseri"],
  "maxPosts": 50
}
```

---

### 🏷️ Scrape hashtag

```json
{
  "mode": "hashtag",
  "keywords": ["#AI"],
  "dateFrom": "1 month",
  "maxPosts": 200
}
```

---

### 🔎 Search keyword (recent)

```json
{
  "mode": "search",
  "keywords": ["LLM agent"],
  "searchSort": "recent",
  "dateFrom": "7 days"
}
```

---

### 💬 Scrape 1 post + replies

```json
{
  "mode": "post",
  "postUrls": ["https://www.threads.com/@zuck/post/ABC123"]
}
```

---

## ⚠️ Lưu ý

* `maxPosts` là giới hạn tối đa — không đảm bảo đủ số lượng
* Dữ liệu tương tác (like, view…) có thể là **ước lượng**
* Chỉ trích xuất **dữ liệu công khai** (không cần đăng nhập / API key)
* Mode `post` mới có replies (~20 phản hồi đầu)
* Thread nhiều phần sẽ được **tự động gộp**

---

## 🤔 FAQ

### Có cần @ hoặc URL không?

Không. Chỉ cần `zuck` là đủ.

---

### Tại sao không đủ số bài?

Có thể do:

* Account ít post
* Hashtag nhỏ
* Threads không còn hiển thị thêm kết quả mới

---

### Field bị null là lỗi?

Không. Đây là giới hạn dữ liệu từ phía Threads, không phải lỗi của tool.

---

## 🆚 So với API Threads chính thức

API Threads của Meta:

* ❌ Chỉ dùng cho tài khoản của bạn
* ❌ Không scrape đối thủ / hashtag
* ❌ Cần OAuth + review app

Với tool này:

* ✅ Lấy dữ liệu công khai
* ✅ Không cần đăng nhập / API key
* ✅ Setup cực nhanh

---

## ⚖️ Disclaimer

Công cụ chỉ thu thập dữ liệu công khai trên Threads.
Không truy cập tài khoản private hoặc vượt qua authentication.

Người dùng cần đảm bảo tuân thủ:

* GDPR
* CCPA
* Điều khoản dịch vụ của Meta

---

## 🔑 Keywords

Threads scraper · Threads API alternative · hashtag scraper · keyword search · social listening · influencer analytics · competitor tracking · marketing data
