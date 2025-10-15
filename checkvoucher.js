(function () {
  // 🧭 Kiểm tra domain
  if (location.hostname !== "shopee.vn") {
    alert("⚠️ Bạn phải đang ở trang Shopee.vn mới chạy được script này!");
    return;
  }

  // 🧑 Kiểm tra đăng nhập
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

  async function fetchVoucher(link) {
    try {
      const url = new URL(link.trim());
      const params = url.searchParams;
      const promotionid =
        params.get("promotionId") ||
        params.get("promotionid") ||
        params.get("promotion_id") ||
        params.get("promo");
      const signature =
        params.get("signature") ||
        params.get("sign") ||
        params.get("sig");

      if (!promotionid || !signature) {
        alert("❌ Link không hợp lệ hoặc thiếu promotionId / signature");
        return;
      }

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
        alert("❌ Không tìm thấy voucher — kiểm tra link hoặc đăng nhập Shopee.");
        return;
      }

      renderVoucher(voucher, promotionid, signature);
    } catch (err) {
      console.error(err);
      alert("❌ Lỗi: " + err.message);
    }
  }

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
        <input type="text" id="voucherLinkInput" placeholder="📎 Dán link voucher Shopee..."
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

  function renderVoucher(voucher, promotionid, signature) {
    const container = document.getElementById("voucherContent");
    if (!container) return;

    let displayName = "Voucher";
    if (voucher.voucher_card?.props?.title) {
      const t = voucher.voucher_card.props.title || "";
      const s = voucher.voucher_card.props.subtitle || "";
      displayName = `${t}${s ? " — " + s : ""}`;
    } else if (voucher.spp_display_info?.voucher_header) {
      displayName = voucher.spp_display_info.voucher_header;
    } else if (voucher.icon_text) {
      displayName = voucher.icon_text;
    } else if (voucher.title) {
      displayName = voucher.title;
    }

    const code = voucher.voucher_code || "(Không có)";
    const percentageUsed = voucher.percentage_used ?? 0;
    const percentageClaimed = voucher.percentage_claimed ?? 0;
    const fullyUsed = voucher.fully_used;
    const fullyClaimed = voucher.fully_claimed;
    const usageLimit = voucher.usage_limit_per_user ?? "—";
    const start = voucher.start_time ? new Date(voucher.start_time * 1000).toLocaleString("vi-VN") : "—";
    const end = voucher.end_time ? new Date(voucher.end_time * 1000).toLocaleString("vi-VN") : "—";
    const iconHash = voucher.icon_hash
      ? `https://down-vn.img.susercontent.com/file/${voucher.icon_hash}_tn`
      : null;

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
        ${iconHash ? `<img src="${iconHash}" style="height:70px;border-radius:8px;margin-bottom:10px;">` : ""}
        <h3 style="color:#EE4D2D;margin:0;font-size:18px;">${escapeHtml(displayName)}</h3>
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
          <button style="background:#4285f4;color:#fff;border:none;padding:10px 16px;border-radius:6px;cursor:pointer;">📄 List</button>
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
