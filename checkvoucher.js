(function () {
  if (location.hostname !== "shopee.vn") {
    alert("⚠️ Bạn phải ở trang Shopee.vn mới chạy script này!");
    return;
  }

  // 🪄 Hàm convert link sang link aff qua proxy server
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

  // ✅ API livestream mới
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

  async function fetchVoucher(input) {
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

      // 🧠 Nếu có streamer_id nhưng không có shop_id thì lấy shop từ livestream
      const streamerId = voucherData.stream_rule?.streamer_ids?.[0];
      if (streamerId && !voucherData.shop_id) {
        const liveInfo = await fetchLiveStreamSession(streamerId);
        if (liveInfo) {
          voucherData.streamer_shop_id = liveInfo.shop_id;
          voucherData.session_id = liveInfo.session_id;
        }
      } else if (streamerId) {
        // có shop_id nhưng vẫn có thể có session_id
        const liveInfo = await fetchLiveStreamSession(streamerId);
        if (liveInfo) {
          voucherData.session_id = liveInfo.session_id;
        }
      }

      renderVoucherList([{ voucher_basic_info: voucherData }]);
    } catch (err) {
      console.error(err);
      alert("❌ Lỗi: " + err.message);
    }
  }

  function renderPopup() {
    const popup = document.createElement("div");
    popup.id = "voucherInfoPopup";
    popup.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: #fff;
      border-radius: 16px;
      padding: 20px;
      z-index: 999999;
      width: 650px;
      box-shadow: 0 8px 30px rgba(0,0,0,0.25);
      font-family: 'Segoe UI', Roboto, sans-serif;
      color: #333;
      max-height: 85vh;
      overflow-y: auto;
    `;
    popup.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h2 style="font-size:18px;margin:0;color:#EE4D2D;">Voucher Checker</h2>
        <button id="closePopupBtn" style="background:none;border:none;font-size:20px;cursor:pointer;color:#999;">✖</button>
      </div>
      <div style="margin-bottom:10px;">
        <textarea id="voucherLinkInput" placeholder="Dán link hoặc ID, mỗi dòng 1 cái..." rows="3" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:6px;font-size:13px;box-sizing:border-box;"></textarea>
        <button id="loadVoucherBtn" style="margin-top:8px;background:#EE4D2D;color:#fff;border:none;padding:8px 14px;border-radius:6px;cursor:pointer;font-weight:bold;font-size:13px;">Tải voucher</button>
      </div>
      <div id="voucherContent" style="margin-top:10px;"></div>
    `;
    document.body.appendChild(popup);

    document.getElementById("closePopupBtn").onclick = () => popup.remove();
    document.getElementById("loadVoucherBtn").onclick = () => {
      const input = document.getElementById("voucherLinkInput").value.trim();
      if (!input) return;
      const container = document.getElementById("voucherContent");
      container.innerHTML = "";
      const lines = input.split("\n").map((l) => l.trim()).filter(Boolean);
      lines.forEach(fetchVoucher);
    };
  }

  async function renderVoucherList(results) {
    const container = document.getElementById("voucherContent");

    for (const item of results) {
      const vb = item.voucher_basic_info;
      const row = document.createElement("div");
      row.style.cssText = `
        padding: 15px;
        border: 1px solid #eee;
        background: #fafafa;
        border-radius: 10px;
        margin-bottom: 12px;
        line-height: 1.6;
        display: flex;
        gap: 14px;
      `;

      const iconHash = vb.icon_hash || null;
      const isShopeeIcon = (vb.icon_text || "").toLowerCase().includes("shopee");
      const bgColor = vb.branding_color || (isShopeeIcon ? "#EE4D2D" : "");
      let iconEl = "";
      if (iconHash) {
        iconEl = `
          <div style="width:50px;height:50px;border-radius:10px;${bgColor ? `background:${bgColor};` : ""}display:flex;justify-content:center;align-items:center;">
            <img src="https://down-vn.img.susercontent.com/file/${iconHash}_tn" style="height:30px;width:30px;object-fit:contain;">
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
        shopLink = await convertToAff(shopLink); // 🪄 convert aff
        applyHtml = `<a href="${shopLink}" target="_blank" style="color:#1a73e8;text-decoration:none;">${applyText}</a>`;
      }

      let mainLine = displayVoucherInfo({ data: { voucher_basic_info: vb } });
      if (vb.voucher_code) {
        const evcode = btoa(vb.voucher_code);
        let voucherLink = `https://shopee.vn/voucher/details?evcode=${encodeURIComponent(evcode)}&from_source=voucher-wallet&promotionId=${vb.promotionid}&signature=${vb.signature || ""}`;
        voucherLink = await convertToAff(voucherLink); // 🪄 convert aff
        mainLine = `<a href="${voucherLink}" target="_blank" style="color:#EE4D2D;text-decoration:none;font-weight:bold;">${escapeHtml(mainLine)}</a>`;
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
      listLink = await convertToAff(listLink); // 🪄 convert aff

      let streamButton = "";
      if (vb.session_id) {
        let streamLink = `https://live.shopee.vn/share?from=live&session=${vb.session_id}`;
        streamLink = await convertToAff(streamLink); // 🪄 convert aff
        streamButton = `
          <a href="${streamLink}" target="_blank" style="text-decoration:none;margin-left:6px;">
            <button style="background:#1a73e8;color:#fff;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;">
              Xem live
            </button>
          </a>`;
      }

      row.innerHTML = `
        ${iconEl}
        <div style="flex:1;">
          <div>${mainLine}</div>
          ${vb.voucher_code ? `<div>- VoucherCode: ${escapeHtml(vb.voucher_code)}</div>` : ""}
          ${applyText ? `<div>- Áp dụng: ${applyHtml}</div>` : ""}
          ${(claimStart || claimEnd) ? `<div>- Claim: ${claimStart || "--"} | ${claimEnd || "--"}</div>` : ""}
          ${(startTime || endTime) ? `<div>- HSD: ${startTime || "--"} | ${endTime || "--"}</div>` : ""}
          <div>Đã dùng: ${percentageUsed}% | Đã lưu: ${percentageClaimed}%</div>
          ${usageLimit ? `<div>Lượt dùng / user: ${usageLimit}</div>` : ""}
          ${warnFlags.length ? `<div style="color:#d93025;">${warnFlags.join(" • ")}</div>` : ""}
          <div style="margin-top:6px;display:flex;align-items:center;">
            <a href="${listLink}" target="_blank" style="text-decoration:none;">
              <button style="background:#4285f4;color:#fff;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;">List</button>
            </a>
            ${streamButton}
          </div>
        </div>
      `;
      container.appendChild(row);
    }
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
