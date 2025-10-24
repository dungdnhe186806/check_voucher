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

  // 📡 Xử lý từng voucher
  async function handleSingleVoucher(input) {
    let promotionid = null;
    let signature = null;

    if (/^\d+$/.test(input)) {
      // 👉 Nếu nhập ID
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
          id: input,
          is_subaccount: true,
        }),
      });

      if (!sigRes.ok) throw new Error(`Lỗi get_voucher HTTP ${sigRes.status}`);
      const sigJson = await sigRes.json();
      signature = sigJson?.data?.signature;
      promotionid = input;

      if (!signature) throw new Error("Không lấy được signature từ ID này.");
    } else {
      // 👉 Nếu nhập link
      const url = new URL(input);
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

    if (!promotionid || !signature) throw new Error("Thiếu promotionId hoặc signature");

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

    if (!res.ok) throw new Error(`Lỗi lấy voucher HTTP ${res.status}`);
    const json = await res.json();
    const voucher =
      json?.data?.id_voucher_mappings?.[promotionid] ||
      Object.values(json?.data?.id_voucher_mappings || {})[0];

    if (!voucher) throw new Error("Không tìm thấy voucher.");

    return { voucher, promotionid, signature };
  }

  // 📡 Xử lý nhiều voucher
  async function fetchMultipleVouchers(rawInput) {
    const container = document.getElementById("voucherContent");
    container.innerHTML = `<div style="text-align:center;color:#999;">⏳ Đang tải...</div>`;

    const lines = rawInput
      .split(/\n|,/)
      .map(l => l.trim())
      .filter(Boolean);

    const results = [];

    for (const line of lines) {
      try {
        const data = await handleSingleVoucher(line);
        results.push({ ...data, error: null });
      } catch (err) {
        results.push({ input: line, error: err.message });
      }
    }

    renderVoucherList(results);
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
      max-width: 520px;
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
        <textarea id="voucherLinkInput" placeholder="Dán link hoặc ID voucher (có thể nhiều dòng)..."
          style="width:100%;padding:10px;border:1px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;height:100px;"></textarea>
        <button id="loadVoucherBtn" style="margin-top:10px;background:#EE4D2D;color:#fff;border:none;padding:10px 16px;border-radius:6px;cursor:pointer;font-weight:bold;">
          Tải voucher
        </button>
      </div>
      <div id="voucherContent" style="margin-top:15px;max-height:400px;overflow-y:auto;"></div>
    `;

    document.body.appendChild(popup);
    document.getElementById("closePopupBtn").onclick = () => popup.remove();
    document.getElementById("loadVoucherBtn").onclick = () => {
      const input = document.getElementById("voucherLinkInput").value.trim();
      if (input) fetchMultipleVouchers(input);
    };
  }

  // 🪄 Hiển thị danh sách voucher
  function renderVoucherList(results) {
    const container = document.getElementById("voucherContent");
    container.innerHTML = "";

    results.forEach(item => {
      const row = document.createElement("div");
      row.style.cssText = `
        padding: 10px;
        border-bottom: 1px solid #eee;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      `;

      if (item.error) {
        row.innerHTML = `
          <div style="color:#d93025;font-size:14px;">❌ ${escapeHtml(item.input)}</div>
          <div style="font-size:12px;color:#888;">${escapeHtml(item.error)}</div>
        `;
        container.appendChild(row);
        return;
      }

      const { voucher, promotionid, signature } = item;

      // 🖼️ icon
      const iconHash = voucher.voucher_card?.props?.icon_hash || voucher.icon_hash || null;
      const iconUrl = iconHash ? `https://down-vn.img.susercontent.com/file/${iconHash}_tn` : null;
      const applyText = voucher.icon_text || "";
      const isShopeeIcon = applyText.trim().toLowerCase() === "shopee";

      let iconHTML = "";
      if (iconUrl) {
        iconHTML = isShopeeIcon
          ? `<div style="background:#EE4D2D;border-radius:10px;padding:4px;display:flex;align-items:center;justify-content:center;"><img src="${iconUrl}" style="height:30px;"></div>`
          : `<img src="${iconUrl}" style="height:30px;border-radius:6px;">`;
      }

      // 🧾 nội dung chính
      const displayName =
        voucher.voucher_card?.props?.title ||
        voucher.spp_display_info?.voucher_header ||
        voucher.icon_text ||
        voucher.title ||
        "Voucher";

      const percentageUsed = voucher.percentage_used ?? 0;
      const percentageClaimed = voucher.percentage_claimed ?? 0;

      const statusText = [];
      if (voucher.fully_used) statusText.push("⚠️ Tối đa lượt dùng");
      if (voucher.fully_claimed) statusText.push("⚠️ Tối đa lượt lưu");

      row.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;">
          ${iconHTML}
          <div>
            <div style="font-weight:600;color:#EE4D2D;">${escapeHtml(displayName)}</div>
            ${applyText ? `<div style="font-size:12px;color:#555;">Áp dụng: ${escapeHtml(applyText)}</div>` : ""}
            ${statusText.length ? `<div style="color:#d93025;font-size:12px;">${statusText.join(" • ")}</div>` : ""}
          </div>
        </div>
        <div style="text-align:right;font-size:13px;">
          <div>Đã dùng: ${percentageUsed}%</div>
          <div>Đã lưu: ${percentageClaimed}%</div>
        </div>
      `;

      container.appendChild(row);
    });
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
