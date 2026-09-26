# Canlı Ders

Öğretmen ile öğrencileri tarayıcı üzerinden canlı derste buluşturan görüntülü ders odası. Kurulum ya da uygulama indirme gerekmez. Oda kodunu paylaşmak yeterlidir.

## Özellikler

- **Kamera ve mikrofon:** Öğretmen ve söz alan öğrenci arasında sesli ve görüntülü iletişim
- **Ekran paylaşımı:** Slayt, soru ve tahtanın sistem sesiyle birlikte anlık paylaşımı
- **Rol ve yetki:** Öğretmen dersi yönetir, öğrenciler izleyici olarak katılır
- **Söz isteme:** Öğrenci el kaldırır, öğretmen tek tıkla söz verir veya sözü geri alır
- **Dersten çıkarma:** Öğretmen istediği öğrenciyi dersten çıkarabilir
- **Canlı sohbet:** Sonradan katılanlar geçmiş mesajları görür, okunmamış mesajlar sayılır
- **Katılımcı listesi:** Mikrofon, kamera, söz ve el kaldırma durumları anlık görünür
- **Konuşma göstergesi:** Konuşan kişinin görüntüsü yeşil çerçeveyle vurgulanır
- **Otomatik yeniden bağlanma:** Öğretmen geç gelirse ya da bağlantı koparsa öğrenciler kendiliğinden yeniden bağlanır
- **Mobil uyumlu arayüz:** Telefon, tablet ve masaüstünde çalışır

## Kullanım

1. **Öğretmen:** Siteyi açar, `Öğretmen` rolünü seçer, adını yazar ve `Dersi başlat` der. Oda kodu otomatik oluşur, istenirse değiştirilebilir.
2. Öğretmen üst çubuktaki **Davet linki** butonuyla linki kopyalayıp öğrencilere gönderir.
3. **Öğrenci:** Linke tıklar, adını yazar ve `Derse gir` der. Öğretmen henüz gelmediyse bekleme ekranı görünür. Ders başlayınca bağlantı otomatik kurulur.
4. Öğrenci soru sormak için **Söz iste** butonuna basar. Öğretmen katılımcı listesinden **Söz ver** dediğinde öğrencinin mikrofonu açılır. Kamerasını ve ekranını da paylaşabilir.
5. Öğretmen **Dersi bitir** dediğinde tüm öğrencilerin bağlantısı kapanır.

## GitHub Pages ile yayınlama

Proje tamamen statik dosyalardan oluşur ve sunucu gerektirmez.

1. Dosyaları GitHub deposuna yükleyin.
2. Depoda **Settings → Pages** sayfasını açın.
3. **Source** olarak `Deploy from a branch`, dal olarak `main` ve klasör olarak `/ (root)` seçip kaydedin.
4. Bir iki dakika içinde site `https://<kullanici-adi>.github.io/<depo-adi>/` adresinde yayına girer.

Kamera, mikrofon ve ekran paylaşımı yalnızca HTTPS üzerinde çalışır. GitHub Pages bunu otomatik sağlar.

## Teknik yapı

| Dosya | Görev |
|---|---|
| `index.html` | Giriş ekranı, ders odası ve simgeler |
| `styles.css` | Arayüz tasarımı ve mobil uyum |
| `app.js` | Bağlantı, medya, roller, sohbet ve arayüz mantığı |

- Görüntü ve ses **WebRTC** ile doğrudan tarayıcılar arasında akar, herhangi bir sunucuda saklanmaz.
- Tarafların birbirini bulması için [PeerJS](https://peerjs.com) açık eşleştirme sunucusu, zor ağ koşulları için PeerJS TURN sunucusu kullanılır.
- Öğretmen merkezdedir. Söz alan öğrencinin sesi ve görüntüsü öğretmen üzerinden diğer öğrencilere iletilir.

## Sınırlar ve notlar

- Bir derse aynı anda **1 öğretmen ve en fazla 3 öğrenci** katılabilir (`app.js` içindeki `MAX_STUDENTS`). Daha kalabalık sınıflar için medya sunucusu (SFU) tabanlı bir altyapı gerekir.
- Desteklenen tarayıcılar: Chrome, Edge, Firefox ve Safari'nin güncel sürümleri. Mobil tarayıcılar ekran paylaşımını desteklemez.
- Bu sürüm tanıtım amaçlıdır. Rol seçimi şifresizdir. Gerçek yetkilendirme, ana site üyelik sistemine bağlanarak eklenecektir.
- Kurumsal kullanımda yoğun trafik için kendi TURN sunucunuzu `app.js` içindeki `ICE` ayarına ekleyebilirsiniz.
