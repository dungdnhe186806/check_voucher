  async function fetchVoucher(input) {
    try {
      const trimmed = input.trim();
      let promotionid = null;
      let signature = null;

      // 👉 Nếu là ID (chỉ chứa số)
      if (/^\d+$/.test(trimmed)) {
        promotionid = trimmed;

        // 📡 Gọi API lấy signature theo ID
        const sigRes = await fetch("https://shopee.vn/api/v4/chat/get_voucher", {
          method: "POST",
          credentials: "include",
          headers: {
            "user-agent": "okhttp/3.12.4",
            "x-shopee-client-timezone": "Asia/Ho_Chi_Minh",
            "content-type": "application/json; charset=UTF-8",
          },
          body: JSON.stringify({
            shop_id: "0",
            voucher_code: "0",
            id: promotionid,
            is_subaccount: true
          }),
        });

        if (!sigRes.ok) throw new Error(`HTTP ${sigRes.status}`);
        const sigJson = await sigRes.json();

        signature = sigJson?.data?.voucher?.signature;
        if (!signature) {
          alert("❌ Không lấy được signature cho ID này");
          return;
        }
      } else {
        // 👉 Nếu là link
        const url = new URL(trimmed);
        const params = url.searchParams;
        promotionid =
          params.get("promotionId") ||
          params.get("promotionid") ||
          params.get("promotion_id") ||
          params.get("promo");
        signature =
          params.get("signature") ||
          params.get("sign") ||
          params.get("sig");
      }

      if (!promotionid || !signature) {
        alert("❌ Link hoặc ID không hợp lệ — thiếu promotionId / signature");
        return;
      }

      // 📡 Gọi API voucher chính
      const res = await fetch(
        "https://shopee.vn/api/v2/voucher_wallet/batch_get_vouchers_by_promotion_ids",
        {
          method: "POST",
          credentials: "include",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            "x-api-source": "pc",
            "x-requested-with": "XMLHttpRequest",
          },
          body: JSON.stringify({
            promotion_info: [
              {
                signature: String(signature),
                signature_source: "0",
                promotionid: Number(promotionid),
                item_info: [],
              },
            ],
            need_user_voucher_status: false,
          }),
        }
      );

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const voucher =
        json?.data?.id_voucher_mappings?.[promotionid] ||
        Object.values(json?.data?.id_voucher_mappings || {})[0];

      if (!voucher) {
        alert("❌ Không tìm thấy voucher — kiểm tra lại ID / link hoặc đăng nhập Shopee.");
        return;
      }

      renderVoucher(voucher, promotionid, signature);
    } catch (err) {
      console.error(err);
      alert("❌ Lỗi: " + err.message);
    }
  }
