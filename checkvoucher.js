(function () {
  // 🧭 Kiểm tra domain
  if (location.hostname !== "shopee.vn") {
    alert("⚠️ Bạn phải đang ở trang Shopee.vn mới chạy được script này!");
    return;
  }

  // 🔐 Kiểm tra đăng nhập
  async function checkLogin() {
    try {
      const res = await fetch("https://shopee.vn/api/v4/account/basic/get_account_info", {
        credentials: "include",
      });
      if (!res.ok) return false;
      const json = await res.json();
      return json?.data?.userid ? true : false;
    } catch {
      return false;
    }
  }

  async function init() {
    const loggedIn = await checkLogin();
    if (!loggedIn) {
      alert("🔒 Bạn cần đăng nhập Shopee trước khi sử dụng tiện ích này!");
      return;
    }
    renderPopup();
  }

  // 📡 Fetch thông tin voucher — hỗ trợ cả link và ID
  async function fetchVoucher(input) {
    try {
      const trimmed = input.trim();
      let promotionid = null;
      let signature = null;

      // 👉 Nếu chỉ nhập ID (chỉ số)
      if (/^\d+$/.test(trimmed)) {
        promotionid = trimmed;

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
            is_subaccount: true,
          }),
        });

        if (!sigRes.ok) throw new Error(`Lỗi get_voucher HTTP ${sigRes.status}`);
        const sigJson = await sigRes.json();
        signature = sigJson?.data?.voucher?.signature;

        if (!signature) {
          alert("❌ Không lấy được signature từ ID này.");
          return;
        }
      } else {
        // 👉 Nếu nhập link
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

  // 🧾 Popup UI
  function renderPopup() {
    const popupId = "voucherInfoPopup";
    document.getElementById(popupId)?.remove();

    const popup = document.createElement("div");
    popup.id = popupId;
    popup.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: #fff;
      border-radius: 16px;
      padding: 20px;
      z-index: 999999;
      max-width: 480px;
      width: 90%;
      box-shadow: 0 8px 30px rgba(0,0,0,0.25);
      font-family: 'Segoe UI', Roboto, sans-serif;
      color: #333;
      animation: fadeIn 0.25s ease-out;
    `;

    popup.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;">
        <h2 style="font-size:18px;margin:0;color:#EE4D2D;">Voucher Checker</h2>
        <button id="closePopupBtn" style="background:none;border:none;font-size:20px;cursor:pointer;color:#999;">✖</button>
      </div>
      <div style="margin-bottom:12px;text-align:center;">
        <input type="text" id="voucherLinkInput" placeholder="Dán link hoặc nhập ID voucher Shopee..."
          style="width:100%;padding:10px;border:1px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;">
        <button id="loadVoucherBtn" style="margin-top:10px;background:#EE4D2D;color:#fff;border:none;padding:10px 16px;border-radius:6px;cursor:pointer;font-weight:bold;">
          Tải voucher
        </button>
      </div>
      <div id="voucherContent" style="margin-top:15px;"></div>
    `;

    document.body.appendChild(popup);
    document.getElementById("closePopupBtn").onclick = () => popup.remove();
    document.getElementById("loadVoucherBtn").onclick = () => {
      const link = document.getElementById("voucherLinkInput").value.trim();
      if (link) fetchVoucher(link);
    };
    document.getElementById("voucherLinkInput").addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        const link = e.target.value.trim();
        if (link) fetchVoucher(link);
      }
    });
  }

  // 🪄 Hiển thị thông tin voucher
  function renderVoucher(voucher, promotionid, signature) {
    const container = document.getElementById("voucherContent");
    if (!container) return;

    let displayName = "Voucher";
    if (voucher.voucher_card?.props?.title) {
      const t = voucher.voucher_card.props.title || "";
      const s = voucher.voucher_card.props.subtitle || "";
      displayName = `${t}${s ? " " + s : ""}`;
    } else if (voucher.spp_display_info?.voucher_header) {
      displayName = voucher.spp_display_info.voucher_header;
    } else if (voucher.icon_text) {
      displayName = voucher.icon_text;
    } else if (voucher.title) {
      displayName = voucher.title;
    }

    const iconHash = voucher.voucher_card?.props?.icon_hash || voucher.icon_hash || null;
    const iconUrl = iconHash ? `https://down-vn.img.susercontent.com/file/${iconHash}_tn` : null;

    const applyText = voucher.icon_text || "";
    const isShopeeIcon = applyText.trim().toLowerCase() === "shopee";

    let iconHTML = "";
    if (iconUrl) {
      if (isShopeeIcon) {
        iconHTML = `
          <div style="background:#EE4D2D;display:inline-flex;align-items:center;justify-content:center;
            border-radius:12px;padding:6px;margin-bottom:10px;">
            <img src="${iconUrl}" style="height:60px;">
          </div>`;
      } else {
        iconHTML = `<img src="${iconUrl}" style="height:70px;border-radius:8px;margin-bottom:10px;">`;
      }
    }

    const code = voucher.voucher_code || "(Không có)";
    const percentageUsed = voucher.percentage_used ?? 0;
    const percentageClaimed = voucher.percentage_claimed ?? 0;
    const fullyUsed = voucher.fully_used;
    const fullyClaimed = voucher.fully_claimed;
    const usageLimit = voucher.usage_limit_per_user ?? "—";
    const start = voucher.start_time ? new Date(voucher.start_time * 1000).toLocaleString("vi-VN") : "—";
    const end = voucher.end_time ? new Date(voucher.end_time * 1000).toLocaleString("vi-VN") : "—";

    const listLink = `https://shopee.vn/search?promotionId=${promotionid}&signature=${signature}`;
    const barWidthUsed = Math.min(percentageUsed, 100);
    const progressBar = `
      <div style="margin-top:10px;height:8px;background:#eee;border-radius:6px;overflow:hidden;">
        <div style="width:${barWidthUsed}%;background:#EE4D2D;height:100%;"></div>
      </div>
      <div style="text-align:right;font-size:12px;color:#555;">${percentageUsed}% đã dùng</div>
      ${fullyUsed ? `<div style="color:#d93025;font-weight:bold;text-align:center;margin-top:6px;">⚠️ Tối đa lượt dùng</div>` : ""}
    `;

    container.innerHTML = `
      <div style="text-align:center;margin-bottom:20px;">
        ${iconHTML}
        <h3 style="color:#EE4D2D;margin:0;font-size:18px;">${escapeHtml(displayName)}</h3>
        ${applyText ? `<div style="font-size:13px;color:#555;margin-top:4px;">Áp dụng: ${escapeHtml(applyText)}</div>` : ""}
        ${progressBar}
      </div>
      <div style="display:grid;grid-template-columns: 1fr 1fr;gap:10px;font-size:14px;">
        <div><b>Code:</b></div><div style="text-align:right">${code}</div>
        <div><b>Giới hạn/user:</b></div><div style="text-align:right">${usageLimit}</div>
        <div><b>fully_used:</b></div><div style="text-align:right">${fullyUsed}</div>
        <div><b>fully_claimed:</b></div><div style="text-align:right">${fullyClaimed}</div>
        <div><b>percentage_claimed:</b></div><div style="text-align:right">${percentageClaimed}</div>
        <div><b>Bắt đầu:</b></div><div style="text-align:right">${start}</div>
        <div><b>Kết thúc:</b></div><div style="text-align:right">${end}</div>
      </div>
      <div style="text-align:center;margin-top:20px;">
        <a href="${listLink}" target="_blank" style="text-decoration:none;">
          <button style="background:#4285f4;color:#fff;border:none;padding:10px 16px;border-radius:6px;cursor:pointer;">List</button>
        </a>
      </div>
    `;
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]));
  }

  init();
})();
