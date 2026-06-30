# CSM Mail Pro — Full Setup Guide (নতুন Project, একদম শুরু থেকে)

এই গাইডটা ধরে নিচ্ছে তুমি **আগের project থেকে আলাদা একটা নতুন Firebase project + নতুন Cloudflare Worker + নতুন domain** দিয়ে পুরো সিস্টেম শুরু থেকে সেটআপ করছো।

ধাপগুলো এই অর্ডারে করো — মাঝখান থেকে শুরু করলে error আসবে।

---

## ০. কী কী লাগবে (আগে থেকে রেডি রাখো)

- [ ] একটা Google account (Firebase project খোলার জন্য)
- [ ] একটা domain (যেমন `uno.pro.bd`) — DNS access সহ
- [ ] Resend.com অ্যাকাউন্ট (mail পাঠানো/রিসিভ করার জন্য)
- [ ] Cloudflare অ্যাকাউন্ট (Worker হোস্ট করার জন্য) + `wrangler` CLI ইনস্টল করা
- [ ] GitHub অ্যাকাউন্ট (GitHub Pages এ site হোস্ট করার জন্য)

---

## ১. নতুন Firebase Project বানাও

1. [console.firebase.google.com](https://console.firebase.google.com) এ যাও
2. **Add project** → একটা নাম দাও (যেমন `csm-mail-uno`) → Continue → Continue → Create
3. বাম পাশের মেনু থেকে **Build → Authentication** এ যাও
   - **Get started** ক্লিক করো
   - Sign-in method ট্যাবে গিয়ে **Google** enable করো (toggle অন করো, support email দাও, Save)
   - একই ট্যাবে **Email/Password** ও enable করো (admin login এর জন্য লাগবে)
4. বাম পাশের মেনু থেকে **Build → Firestore Database** এ যাও
   - **Create database** ক্লিক করো
   - Location সিলেক্ট করো (যেকোনো কাছাকাছি region, যেমন `asia-south1`)
   - **Start in production mode** সিলেক্ট করো → Create
5. **Project settings** (⚙️ আইকন, উপরে বামে) → **General** ট্যাব
   - নিচে স্ক্রল করে **Your apps** সেকশনে যাও
   - `</>` (Web) আইকনে ক্লিক করো → একটা নিকনেম দাও (যেমন `csm-mail-web`) → **Register app**
   - যে `firebaseConfig` অবজেক্ট দেখাবে, সেটা **কপি করে রাখো** — এটা পরে সব HTML ফাইলে বসাতে হবে। এরকম দেখতে হবে:

```js
const firebaseConfig = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "csm-mail-uno.firebaseapp.com",
  projectId: "csm-mail-uno",
  storageBucket: "csm-mail-uno.firebasestorage.app",
  messagingSenderId: "XXXXXXXXXXXX",
  appId: "1:XXXXXXXXXXXX:web:XXXXXXXXXXXXXXXXXXXXXX"
};
```

---

## ২. Admin Login User বানাও

1. Firebase Console → **Authentication → Users** ট্যাব
2. **Add user** ক্লিক করো
   - Email: `admin@তোমার-domain.com` (যেমন `admin@uno.pro.bd`)
   - Password: তোমার পছন্দের একটা strong password
3. Save করো — এই email/password দিয়ে `admin.html` এ login করবে

---

## ৩. Service Account বানাও (Cloudflare Worker এর জন্য)

এটা Worker কে Firestore-এ সরাসরি লেখার (inbound mail সেভ করার) অনুমতি দেবে।

1. Project settings (⚙️) → **Service accounts** ট্যাব
2. **Generate new private key** বাটনে ক্লিক করো → confirm করো
3. একটা `.json` ফাইল ডাউনলোড হবে — এটা **কাউকে শেয়ার করবে না, GitHub এ আপলোড করবে না**
4. ফাইলটা খুললে এরকম দেখবে:

```json
{
  "client_email": "firebase-adminsdk-xxxxx@csm-mail-uno.iam.gserviceaccount.com",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQ...\n-----END PRIVATE KEY-----\n"
}
```

5. এই দুইটা value আলাদা করে রাখো — এগুলো ধাপ ৬ এ লাগবে:
   - `client_email` → Worker এর `GCP_SA_EMAIL`
   - `private_key` → Worker এর `GCP_SA_PRIVATE_KEY`

---

## ৪. Firestore Security Rules বসাও

Firestore Database → **Rules** ট্যাব এ গিয়ে এই rules পেস্ট করো এবং **Publish** করো:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // নাম availability check + public lookup এর জন্য read সবার জন্য খোলা
    match /tenants/{id} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.uid == request.resource.data.ownerUid;
    }

    // broadcast mail history — owner ও admin দেখতে পারবে
    match /broadcasts/{id} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }

    // ইনকামিং mail — শুধু Worker (service account) লিখবে, ক্লায়েন্ট থেকে লেখা বন্ধ
    match /inbox/{id} {
      allow read: if request.auth != null;
      allow write: if false;
    }
  }
}
```

> পরে security আরও টাইট করতে চাইলে `broadcasts` read-কে শুধু admin email এর জন্য সীমাবদ্ধ করতে পারো:
> `allow read: if request.auth.token.email == 'admin@uno.pro.bd';`

---

## ৫. Domain DNS + Resend Setup

### ৫.১ Resend এ domain যোগ করো
1. [resend.com](https://resend.com) এ অ্যাকাউন্ট খোলো / লগইন করো
2. **Domains → Add Domain** → তোমার domain লেখো (যেমন `uno.pro.bd`)
3. Resend তোমাকে কিছু DNS record দেবে (MX, TXT/SPF, DKIM)
4. তোমার domain registrar (যেখানে domain কেনা) এ গিয়ে DNS ম্যানেজার থেকে ওই record গুলো হুবহু বসাও
5. Resend ড্যাশবোর্ডে ফিরে এসে **Verify** ক্লিক করো (DNS propagate হতে কয়েক ঘণ্টা লাগতে পারে)

### ৫.২ Inbound email enable করো
1. Resend Dashboard → **Inbound** সেকশন এ যাও
2. তোমার ভেরিফাইড domain সিলেক্ট করো
3. **Webhook URL** ফিল্ডে বসাও:
   ```
   https://তোমার-worker-নাম.workers.dev/inbound
   ```
   (এই URL ধাপ ৭ এর পর পাবে — Worker deploy করার পর এসে এখানে বসাবে)
4. Save করো

### ৫.৩ API Key বানাও
- Resend Dashboard → **API Keys → Create API Key** → পুরো access দিয়ে বানাও → key কপি করে রাখো (এটা একবারই দেখাবে)

---

## ৬. Cloudflare Worker Setup

### ৬.১ Wrangler ইনস্টল ও লগইন
```bash
npm install -g wrangler
wrangler login
```

### ৬.২ নতুন Worker প্রজেক্ট বানাও
```bash
wrangler init csm-mail-worker
cd csm-mail-worker
```
যখন প্রশ্ন আসবে "Do you want to use TypeScript?" → **No** সিলেক্ট করো।
`src/index.js` ফাইলের ভেতরের পুরো কোড **মুছে ফেলে** আগের চ্যাটে দেওয়া `worker.js` এর সম্পূর্ণ কোড পেস্ট করো।

### ৬.৩ Secrets বসাও
একে একে এই কমান্ডগুলো রান করো, প্রতিটায় ভ্যালু চাইবে:

```bash
wrangler secret put RESEND_API_KEY
# → ধাপ ৫.৩ এর Resend API key পেস্ট করো

wrangler secret put FIREBASE_PROJECT_ID
# → তোমার নতুন Firebase project ID (যেমন: csm-mail-uno)

wrangler secret put GCP_SA_EMAIL
# → ধাপ ৩ এর client_email পেস্ট করো

wrangler secret put GCP_SA_PRIVATE_KEY
# → ধাপ ৩ এর private_key পুরোটা পেস্ট করো (\n সহ যেভাবে আছে সেভাবেই)
```

### ৬.৪ Worker কোডে domain বসাও
`worker.js` ফাইলে এই লাইনটা খুঁজে বের করো:
```js
const DOMAIN = 'uno.pro.bd'; // ← change if your sending domain differs
```
তোমার নতুন project এর domain দিয়ে আপডেট করো (যদি ভিন্ন হয়)।

### ৬.৫ Deploy করো
```bash
wrangler deploy
```
Deploy শেষে একটা URL দেখাবে, যেমন:
```
https://csm-mail-worker.তোমার-ইউজারনেম.workers.dev
```
এই URL টা কপি করে রাখো — এটাই তোমার নতুন `WORKER` URL।

### ৬.৬ Resend Webhook URL আপডেট করো
ধাপ ৫.২ এ ফিরে গিয়ে Webhook URL বসাও:
```
https://csm-mail-worker.তোমার-ইউজারনেম.workers.dev/inbound
```

---

## ৭. সব HTML ফাইলে নতুন Config বসাও

এই ৪টা ফাইলে (`landing.html`, `register.html`, `admin.html`, এবং mail panel ফাইলে) দুই জায়গায় পরিবর্তন করতে হবে:

### ৭.১ Firebase Config বদলাও
প্রতিটা ফাইলে `<script type="module">` ব্লকের ভেতরে যেখানে এই আছে:
```js
const firebaseConfig = {
  apiKey: "...",
  authDomain: "mail-67221.firebaseapp.com",
  projectId: "mail-67221",
  ...
};
```
এটাকে ধাপ ১ এ কপি করা **নতুন** `firebaseConfig` দিয়ে রিপ্লেস করো — **৪টা ফাইলেই একই config বসবে**।

### ৭.২ Worker URL বদলাও
Mail panel ফাইলে (যেখানে compose/send হয়) এই লাইন খুঁজো:
```js
const WORKER = "https://blue-bush-b386.futurebd.workers.dev";
```
নতুন Worker URL (ধাপ ৬.৫) দিয়ে বদলাও।

### ৭.৩ Domain reference বদলাও
`register.html` ও `admin.html` এ যেখানে `@uno.pro.bd` লেখা আছে (email domain হিসেবে দেখানোর জন্য), সেটা তোমার আসল domain দিয়ে ঠিক করো যদি ভিন্ন হয়।

### ৭.৪ Admin email বদলাও
`admin.html` ফাইলে এই লাইন খুঁজো:
```js
const ADMIN_EMAIL = 'admin@mohasin.bro.bd';
```
ধাপ ২ এ বানানো নতুন admin email দিয়ে বদলাও।

---

## ৮. GitHub Pages এ Deploy করো

1. GitHub এ একটা নতুন repo বানাও (যেমন `csm-mail-uno`)
2. ৪টা ফাইল আপলোড/পুশ করো:
   - `landing.html`
   - `register.html`
   - `admin.html`
   - mail panel ফাইল (`index.html` বা `mail.html`)
3. **ফাইল নামকরণ গুরুত্বপূর্ণ:**
   - `landing.html` কে **`index.html`** নাম দাও (এটাই হবে public homepage, root এ থাকতে হবে)
   - পুরোনো mail panel ফাইলকে **`mail.html`** নাম দাও
   - তারপর `register.html` ও `admin.html` এর ভেতরে যেখানে redirect হয় (`window.location.href = 'index.html?id=' + ...`), ওটা বদলে দাও:
     ```js
     window.location.href = 'mail.html?id=' + encodeURIComponent(name);
     ```
4. Repo → **Settings → Pages** → Source: `main` branch, `/ (root)` → Save
5. কিছুক্ষণ পর তোমার সাইট লাইভ হবে: `https://তোমার-ইউজারনেম.github.io/csm-mail-uno/`

### (ঐচ্ছিক) Custom domain যুক্ত করো
- GitHub Pages → Custom domain ফিল্ডে `uno.pro.bd` বসাও
- DNS এ `CNAME` বা `A` record যোগ করো (GitHub এর instructions অনুসরণ করো)

---

## ৯. Firebase Authorized Domains আপডেট করো

1. Firebase Console → **Authentication → Settings → Authorized domains**
2. **Add domain** ক্লিক করো → তোমার লাইভ domain যোগ করো:
   - `তোমার-ইউজারনেম.github.io`
   - কাস্টম domain ব্যবহার করলে সেটাও (যেমন `uno.pro.bd`)

এটা না করলে Google Sign-In এ `auth/unauthorized-domain` error আসবে।

---

## ১০. টেস্ট চেকলিস্ট

- [ ] `index.html` (landing) খুলে About/Contact/Terms মেনু কাজ করছে
- [ ] "Sign in with Google" ক্লিক করলে `register.html` এ যাচ্ছে এবং Google পপআপ আসছে
- [ ] নতুন নাম রেজিস্টার করলে Firestore এর `tenants` কালেকশনে ডকুমেন্ট তৈরি হচ্ছে
- [ ] রেজিস্ট্রেশনের পর `mail.html` এ redirect হচ্ছে
- [ ] `mail.html` থেকে টেস্ট মেইল পাঠালে Resend দিয়ে ডেলিভার হচ্ছে এবং `broadcasts` কালেকশনে সেভ হচ্ছে
- [ ] `admin.html` এ admin email/password দিয়ে লগইন করা যাচ্ছে এবং রেজিস্ট্রেশন লিস্ট দেখা যাচ্ছে
- [ ] বাইরের কোনো ইমেইল থেকে `yourname@domain.com` এ মেইল পাঠালে Resend webhook → Worker → Firestore `inbox` কালেকশনে সেভ হচ্ছে (`wrangler tail` দিয়ে লগ চেক করতে পারো)

---

## সমস্যা হলে যেভাবে ডিবাগ করবে

| সমস্যা | কোথায় চেক করবে |
|---|---|
| Google sign-in কাজ করছে না | Firebase Authorized domains, এবং `firebaseConfig` সব ফাইলে ঠিকমতো বসানো আছে কিনা |
| নাম রেজিস্টার হচ্ছে না | Firestore Rules publish করা হয়েছে কিনা, browser console এ error দেখো |
| Mail পাঠানো যাচ্ছে না | Worker secret `RESEND_API_KEY` ঠিক আছে কিনা, `wrangler tail` দিয়ে Worker লগ দেখো |
| Inbound mail আসছে না | Resend domain verify হয়েছে কিনা, webhook URL ঠিক আছে কিনা, `GCP_SA_PRIVATE_KEY` ঠিকমতো পেস্ট হয়েছে কিনা |
| Admin লগইন হচ্ছে না | Firebase Authentication এ Email/Password enable আছে কিনা, ইউজার বানানো হয়েছে কিনা |
