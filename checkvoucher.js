(function () {
  if (location.hostname !== "shopee.vn") {
    alert("⚠️ Bạn phải ở trang Shopee.vn mới chạy script này!");
    return;
  }

  // ✂️ Cắt ID (LIVE-, VIDEO-, FS-...)
  function extractId(input) {
    const clean = input.trim();
    const match = clean.match(/(?:LIVE|VIDEO|FS)-?(\d+)/i);
    if (match) return match[1];
    try {
      const url = new URL(clean);
      return (
        url.searchParams.get("promotionId") ||
        url.searchParams.get("promotionid") ||
        url.searchParams.get("promotion_id") ||
        url.searchParams.get("promo") ||
        clean
      );
    } catch {
      return clean;
    }
  }

  // 🪄 convert AFF
  async function convertToAff(originalLink) {
    try {
      const res = await fetch("https://conclusive-marietta-overaffected.ngrok-free.dev/convert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ originalLink })
      });
      const data = await res.json();
      return data.shortLink || originalLink;
    } catch (e) {
      console.error("❌ Lỗi convert aff:", e);
      return originalLink;
    }
  }

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
      alert("🔒 Bạn cần đăng nhập Shopee trước!");
      return;
    }
    if (!document.getElementById("voucherInfoPopup")) renderPopup();
  }

  async function getSignatureByChatVoucher(promotionId) {
    const res = await fetch("https://shopee.vn/api/v4/chat/get_voucher", {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json; charset=UTF-8",
        "x-shopee-client-timezone": "Asia/Ho_Chi_Minh",
      },
      body: JSON.stringify({
        shop_id: "0",
        voucher_code: "0",
        id: String(promotionId),
        is_subaccount: true,
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data?.signature || null;
  }

  async function fetchVoucherBatch(promotionId, signature) {
    const res = await fetch(
      "https://shopee.vn/api/v2/voucher_wallet/batch_get_vouchers_by_promotion_ids",
      {
        method: "POST",
        credentials: "include",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-api-source": "pc",
        },
        body: JSON.stringify({
          promotion_info: [
            {
              signature: String(signature),
              signature_source: "0",
              promotionid: Number(promotionId),
              item_info: [],
            },
          ],
          need_user_voucher_status: false,
        }),
      }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const mappings = json?.data?.id_voucher_mappings || {};
    return mappings[promotionId] || Object.values(mappings)[0];
  }

  // ✅ API livestream
  async function fetchLiveStreamSession(streamerId) {
    try {
      const res = await fetch("https://shopee.vn/api/v4/chat/get_live_streaming_session", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          "x-shopee-client-timezone": "Asia/Ho_Chi_Minh",
        },
        body: JSON.stringify({ user_ids: [Number(streamerId)] }),
      });
      if (!res.ok) return null;
      const json = await res.json();
      const session = json?.data?.sessions?.[0];
      if (!session) return null;

      return {
        shop_id: session.shop_id,
        shop_name: session.shop_name,
        session_id: session.session_id,
      };
    } catch (e) {
      console.error("Lỗi fetch livestream info:", e);
      return null;
    }
  }

  async function fetchVoucher(inputRaw) {
    const input = extractId(inputRaw);
    try {
      let promotionId = "";
      let signature = "";
      let voucherData = null;

      if (/^\d+$/.test(input)) {
        promotionId = input.trim();
        signature = await getSignatureByChatVoucher(promotionId);
        if (!signature) {
          alert(`❌ Không lấy được signature cho ID: ${promotionId}`);
          return;
        }
        voucherData = await fetchVoucherBatch(promotionId, signature);
      } else {
        const url = new URL(input.trim());
        const params = url.searchParams;
        promotionId =
          params.get("promotionId") ||
          params.get("promotionid") ||
          params.get("promotion_id") ||
          params.get("promo");
        signature =
          params.get("signature") ||
          params.get("sign") ||
          params.get("sig") ||
          (promotionId ? await getSignatureByChatVoucher(promotionId) : null);

        if (!promotionId || !signature) {
          alert(`❌ Thiếu promotionId hoặc signature (input: ${input})`);
          return;
        }
        voucherData = await fetchVoucherBatch(promotionId, signature);
      }

      if (!voucherData) {
        alert(`❌ Không tìm thấy voucher cho ID: ${promotionId}`);
        return;
      }

      const streamerId = voucherData.stream_rule?.streamer_ids?.[0];
      if (streamerId && !voucherData.shop_id) {
        const liveInfo = await fetchLiveStreamSession(streamerId);
        if (liveInfo) {
          voucherData.streamer_shop_id = liveInfo.shop_id;
          voucherData.session_id = liveInfo.session_id;
        }
      } else if (streamerId) {
        const liveInfo = await fetchLiveStreamSession(streamerId);
        if (liveInfo) voucherData.session_id = liveInfo.session_id;
      }

      renderVoucherList([{ voucher_basic_info: voucherData }]);
    } catch (err) {
      console.error(err);
      alert("❌ Lỗi: " + err.message);
    }
  }

  // 🧾 renderVoucherList có avatar to
  async function renderVoucherList(results) {
    const container = document.getElementById("voucherContent");

    for (const item of results) {
      const vb = item.voucher_basic_info;
      const row = document.createElement("div");
      row.style.cssText = `
        border: 1px solid #eee;
        background: #fff;
        border-radius: 12px;
        margin-bottom: 12px;
        line-height: 1.55;
        padding: 14px 16px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.06);
        display: flex;
        gap: 14px;
        align-items: flex-start;
      `;

      // 🖼️ avatar — to 60px
      let avatarHtml = "";
      if (vb.icon_hash) {
        avatarHtml = `
          <div style="width:60px;height:60px;border-radius:12px;overflow:hidden;flex-shrink:0;">
            <img src="https://down-vn.img.susercontent.com/file/${vb.icon_hash}_tn"
                 style="width:100%;height:100%;object-fit:cover;">
          </div>`;
      }

      const iconText = vb.icon_text || "";
      const contentLabel = vb.customised_labels?.[0]?.content || "";
      const applyParts = [];
      if (iconText) applyParts.push(iconText);
      if (contentLabel) applyParts.push(contentLabel);
      const applyText = escapeHtml(applyParts.join(" - "));

      let applyHtml = applyText;
      const targetShopId = vb.shop_id || vb.streamer_shop_id;
      if (targetShopId) {
        let shopLink = `https://shopee.vn/shop/${targetShopId}`;
        shopLink = await convertToAff(shopLink);
        applyHtml = `<a href="${shopLink}" target="_blank" style="color:#1a73e8;text-decoration:none;">${applyText}</a>`;
      }

      let mainLine = displayVoucherInfo({ data: { voucher_basic_info: vb } });
      if (vb.voucher_code) {
        const evcode = btoa(vb.voucher_code);
        let voucherLink = `https://shopee.vn/voucher/details?evcode=${encodeURIComponent(evcode)}&from_source=voucher-wallet&promotionId=${vb.promotionid}&signature=${vb.signature || ""}`;
        voucherLink = await convertToAff(voucherLink);
        mainLine = `<a href="${voucherLink}" target="_blank" style="color:#EE4D2D;text-decoration:none;font-weight:700;">${escapeHtml(mainLine)}</a>`;
      }

      const percentageUsed = vb.percentage_used ?? 0;
      const percentageClaimed = vb.percentage_claimed ?? 0;
      const warnFlags = [];
      if (vb.fully_used) warnFlags.push("Tối đa lượt dùng");
      if (vb.fully_claimed) warnFlags.push("Tối đa lượt lưu");

      const claimStart = formatTime(vb.claim_start_time);
      const claimEnd = formatTime(vb.claim_end_time);
      const startTime = formatTime(vb.start_time);
      const endTime = formatTime(vb.end_time);
      const usageLimit = vb.usage_limit_per_user ?? 0;

      let listLink = `https://shopee.vn/search?promotionId=${vb.promotionid}&signature=${vb.signature || ""}`;
      listLink = await convertToAff(listLink);

      let streamButton = "";
      if (vb.session_id) {
        let streamLink = `https://live.shopee.vn/share?from=live&session=${vb.session_id}`;
        streamLink = await convertToAff(streamLink);
        streamButton = `
          <a href="${streamLink}" target="_blank" style="text-decoration:none;margin-left:8px;">
            <button style="background:#14b8a6;color:#fff;border:none;padding:8px 12px;border-radius:10px;cursor:pointer;font-size:12px;font-weight:600;">
              Xem live
            </button>
          </a>`;
      }

      row.innerHTML = `
        ${avatarHtml}
        <div style="display:flex;flex-direction:column;gap:6px;flex:1;">
          <div style="font-size:15px;">${mainLine}</div>
          ${vb.voucher_code ? `<div style="font-size:13px;color:#555;">- Mã: <span style="font-weight:600;color:#111">${escapeHtml(vb.voucher_code)}</span></div>` : ""}
          ${applyText ? `<div style="font-size:13px;color:#444;">- Áp dụng: ${applyHtml}</div>` : ""}
          ${(claimStart || claimEnd) ? `<div style="font-size:12px;color:#666;">- Claim: ${claimStart || "--"} | ${claimEnd || "--"}</div>` : ""}
          ${(startTime || endTime) ? `<div style="font-size:12px;color:#666;">- HSD: ${startTime || "--"} | ${endTime || "--"}</div>` : ""}
          <div style="font-size:12px;color:#555;">Đã dùng: ${percentageUsed}% | Đã lưu: ${percentageClaimed}%</div>
          ${usageLimit ? `<div style="font-size:12px;color:#555;">Lượt dùng / user: ${usageLimit}</div>` : ""}
          ${warnFlags.length ? `<div style="font-size:12px;color:#d93025;">${warnFlags.join(" • ")}</div>` : ""}
          <div style="margin-top:4px;display:flex;align-items:center;">
            <a href="${listLink}" target="_blank" style="text-decoration:none;">
              <button style="background:#2563eb;color:#fff;border:none;padding:8px 12px;border-radius:10px;cursor:pointer;font-size:12px;font-weight:600;">List</button>
            </a>
            ${streamButton}
          </div>
        </div>
      `;
      container.appendChild(row);
    }
  }

  // 📜 Giao diện popup đẹp
  function renderPopup() {
    const popup = document.createElement("div");
    popup.id = "voucherInfoPopup";
    popup.style.cssText = `
      position: fixed;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      background: #ffffff;
      border-radius: 18px;
      padding: 18px;
      z-index: 999999;
      width: 680px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.18);
      font-family: 'Segoe UI', Roboto, system-ui, -apple-system, sans-serif;
      color: #111827;
      max-height: 85vh;
      overflow-y: auto;
    `;
    popup.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h2 style="font-size:18px;margin:0;color:#EE4D2D;font-weight:800;letter-spacing:.2px;">Voucher Checker</h2>
        <button id="closePopupBtn" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;">✖</button>
      </div>
      <div style="margin-bottom:10px;">
        <div style="position:relative;">
          <textarea id="voucherLinkInput"
            placeholder="Dán link hoặc ID (hỗ trợ LIVE-xxx, VIDEO-xxx, FS-xxx...) — mỗi dòng 1 cái"
            rows="3"
            style="width:100%;padding:12px 14px;border: 2px solid #f3f4f6;border-radius: 12px;font-size:13.5px;line-height:1.5;box-sizing:border-box;outline:none;transition: border .15s, box-shadow .15s;background:#fafafa;">
          </textarea>
          <div style="position:absolute;right:10px;bottom:8px;font-size:11px;color:#9ca3af;">Enter mỗi dòng</div>
        </div>
        <button id="loadVoucherBtn"
          style="margin-top:10px;background:#EE4D2D;color:#fff;border:none;padding:10px 16px;border-radius:10px;cursor:pointer;font-weight:700;font-size:13px;letter-spacing:.2px;">
          Tải voucher
        </button>
      </div>
      <div id="voucherContent" style="margin-top:6px;"></div>
    `;
    document.body.appendChild(popup);

    const input = popup.querySelector("#voucherLinkInput");
    input.addEventListener("focus", () => {
      input.style.border = "2px solid #fecaca";
      input.style.boxShadow = "0 0 0 6px rgba(238,77,45,.07)";
      input.style.background = "#fff";
    });
    input.addEventListener("blur", () => {
      input.style.border = "2px solid #f3f4f6";
      input.style.boxShadow = "none";
      input.style.background = "#fafafa";
    });

    document.getElementById("closePopupBtn").onclick = () => popup.remove();
    const btn = document.getElementById("loadVoucherBtn");
    btn.onmouseover = () => btn.style.background = "#d94427";
    btn.onmouseout  = () => btn.style.background = "#EE4D2D";
    btn.onclick = () => {
      const raw = input.value.trim();
      if (!raw) return;
      const container = document.getElementById("voucherContent");
      container.innerHTML = "";
      const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
      lines.forEach(fetchVoucher);
    };
  }

  function formatTime(ts) {
    if (!ts) return "";
    const d = new Date(ts * 1000);
    return d.toLocaleString("vi-VN");
  }

  function formatCurrency(raw) {
    const amount = Math.floor(raw / 100000);
    if (amount === 0) return "₫0đ";
    if (amount < 1000) return `₫${amount}đ`;
    if (amount < 1000000) {
      if (amount % 1000 === 0) return `₫${amount / 1000}k`;
      const thousands = Math.floor(amount / 1000);
      const remainder = amount % 1000;
      return `₫${thousands}k${remainder}`;
    } else {
      const millions = Math.floor(amount / 1000000);
      const remainder = amount % 1000000;
      if (remainder === 0) return `₫${millions}tr`;
      if (remainder % 1000 === 0) return `₫${millions}tr${remainder / 1000}k`;
      const thousands = Math.floor(remainder / 1000);
      return `₫${millions}tr${thousands}k`;
    }
  }

  function displayVoucherInfo(voucherData) {
    try {
      const basicInfo = voucherData.data.voucher_basic_info;
      const discountPercentage = basicInfo.discount_percentage || basicInfo.reward_percentage || 0;
      const discountValue =
        basicInfo.discount_value || basicInfo.reward_value || basicInfo.reward_cap || 0;
      const maxDiscount = basicInfo.reward_cap || basicInfo.discount_cap || 0;
      const minSpend = basicInfo.min_spend || 0;

      const maxDiscountFormatted = formatCurrency(discountValue || maxDiscount);
      const minSpendFormatted = formatCurrency(minSpend);

      if (discountPercentage === 0) {
       ...và phần cuối tiếp theo 👇 (đây là đoạn hoàn tất hàm `displayVoucherInfo` + escape)

```javascript
      if (discountPercentage === 0) {
        return `Giảm ${maxDiscountFormatted} đơn từ ${minSpendFormatted}`;
      } else {
        return `Giảm ${discountPercentage}% tối đa ${maxDiscountFormatted} đơn từ ${minSpendFormatted}`;
      }
    } catch (error) {
      console.error("Lỗi khi xử lý dữ liệu voucher:", error);
      return "Không thể hiển thị thông tin voucher";
    }
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) =>
      ({"&": "&amp;","<": "&lt;",">": "&gt;",'"': "&quot;","'": "&#39;"}[c])
    );
  }

  init();
})();
