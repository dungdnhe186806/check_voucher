(function () {
  async function fetchVoucher(inputLink) {
    try {
      const url = new URL(inputLink.trim());
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

      renderPopup(inputLink, voucher, promotionid, signature);
    } catch (err) {
      console.error(err);
      alert("❌ Lỗi: " + err.message);
    }
  }

  function renderPopup(inputLink, voucher, promotionid, signature) {
    // 🧠 Ưu tiên tên hiển thị
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
    const barWidthUsed = Math.min(percentageUsed, 100);
    const listLink = `https://shopee.vn/search?promotionId=${promotionid}&signature=${signature}`;

    const progressBar = `
      <div style="margin-top:10px;height:8px;background:#eee;border-radius:6px;overflow:hidden;">
        <div style="width:${barWidthUsed}%;background:#EE4D2D;height:100%;"></div>
      </div>
      <div style="text-align:right;font-size:12px;color:#555;">${percentageUsed}% đã dùng</div>
    `;

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
      padding: 24px;
      z-index: 999999;
      max-width: 480px;
      width: 90%;
      box-shadow: 0 10px 40px rgba(0,0,0,0.25);
      font-family: 'Segoe UI', Roboto, sans-serif;
      color: #333;
      border-top: 5px solid ${fullyUsed ? "#888" : "#EE4D2D"};
      animation: fadeIn 0.2s ease-out;
    `;

    popup.innerHTML = `
      <div style="margin-bottom:16px;text-align:center;">
        <input type="text" id="voucherLinkInput" placeholder="📎 Dán link voucher Shopee vào đây..."
          value="${escapeHtml(inputLink)}"
          style="width:100%;padding:10px;border:1px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;">
        <button id="reloadVoucherBtn" style="margin-top:8px;background:#EE4D2D;color:#fff;border:none;padding:8px 12px;border-radius:6px;cursor:pointer;">
          🔄 Tải lại
        </button>
      </div>
      <div style="text-align:center;margin-bottom:20px;">
        ${iconHash ? `<img src="${iconHash}" alt="icon" style="height:70px;border-radius:8px;margin-bottom:10px;">` : ""}
        <h2 style="color:#EE4D2D;margin:0;font-size:20px;">${escapeHtml(displayName)}</h2>
        ${progressBar}
      </div>
      <div style="display:grid;grid-template-columns: 1fr 1fr;gap:10px;font-size:14px;">
        <div><b>Mã:</b></div><div style="text-align:right">${code}</div>
        <div><b>Giới hạn/user:</b></div><div style="text-align:right">${usageLimit}</div>
        <div><b>fully_used:</b></div><div style="text-align:right">${fullyUsed}</div>
        <div><b>fully_claimed:</b></div><div style="text-align:right">${fullyClaimed}</div>
        <div><b>percentage_claimed:</b></div><div style="text-align:right">${percentageClaimed}</div>
        <div><b>Bắt đầu:</b></div><div style="text-align:right">${start}</div>
        <div><b>Kết thúc:</b></div><div style="text-align:right">${end}</div>
      </div>
      <div style="text-align:center;margin-top:20px;">
        <button id="closeVoucherBtn" style="background:#EE4D2D;color:#fff;border:none;padding:10px 16px;margin-right:8px;border-radius:6px;cursor:pointer;font-weight:bold;">Đóng</button>
        <button id="copyVoucherBtn" style="background:#f2f2f2;color:#333;border:none;padding:10px 16px;border-radius:6px;cursor:pointer;">Copy JSON</button>
        <a href="${listLink}" target="_blank" style="text-decoration:none;">
          <button style="background:#4285f4;color:#fff;border:none;padding:10px 16px;margin-left:8px;border-radius:6px;cursor:pointer;">📄 List</button>
        </a>
      </div>
    `;

    document.body.appendChild(popup);

    document.getElementById("closeVoucherBtn").onclick = () => popup.remove();
    document.getElementById("copyVoucherBtn").onclick = async () => {
      try {
        await navigator.clipboard.writeText(JSON.stringify(voucher, null, 2));
        alert("✅ Đã copy JSON voucher vào clipboard!");
      } catch {
        console.log(voucher);
        alert("⚠️ Không thể copy — mở console để lấy dữ liệu.");
      }
    };

    document.getElementById("reloadVoucherBtn").onclick = () => {
      const newLink = document.getElementById("voucherLinkInput").value.trim();
      if (newLink) fetchVoucher(newLink);
    };
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

  // 🚀 Khởi chạy popup trống ban đầu
  renderPopup("", {}, "", "");
})();
