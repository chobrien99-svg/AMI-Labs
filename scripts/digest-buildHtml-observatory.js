// ============================================
// AMI Observatory — Email Digest (Observatory Theme)
// Drop-in replacement for buildHtml + row helpers
// ============================================

function articleRow(a) {
  // Determine tag color based on category (if available)
  let tagHtml = "";
  if (a.category) {
    const tagColors = {
      funding:  { bg: "#F5F0D8", color: "#7A6B0B" },
      research: { bg: "#E5EFF5", color: "#3A6B8A" },
      hiring:   { bg: "#E8F2EB", color: "#2A6B4A" },
      product:  { bg: "#E8F2EB", color: "#2A6B4A" },
    };
    const tc = tagColors[a.category.toLowerCase()] || { bg: "#EDE8DF", color: "#6B6355" };
    tagHtml = `<span style="font-size:10px;font-weight:600;color:${tc.color};background:${tc.bg};padding:2px 8px;border-radius:100px;display:inline-block;margin-left:6px;">${a.category}</span>`;
  }

  const source = a.source ? `<span style="font-size:11px;color:#8C8474;">${a.source}</span><span style="font-size:11px;color:#D5CEBD;padding:0 6px;">|</span>` : "";
  const date = a.date || a.addedAt ? new Date(a.date || a.addedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";

  return `<tr>
    <td style="padding:0 0 16px;">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td width="4" valign="top" style="padding-top:4px;">
          <div style="width:4px;height:40px;background:#C8962E;border-radius:2px;"></div>
        </td>
        <td style="padding-left:12px;">
          <a href="${a.url}" style="font-size:14px;font-weight:600;color:#2C2517;text-decoration:none;line-height:1.4;display:block;margin-bottom:4px;">${a.title}</a>
          <div>
            ${source}
            <span style="font-size:11px;color:#8C8474;">${date}</span>
            ${tagHtml}
          </div>
        </td>
      </tr></table>
      <div style="border-bottom:1px solid #EDE8DF;padding-top:16px;"></div>
    </td>
  </tr>`;
}

function jobRow(j) {
  const location = j.location || "";
  return `<tr>
    <td style="padding:0 0 10px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F3EC;border-radius:6px;">
        <tr>
          <td style="padding:12px 14px;">
            <a href="${j.url}" style="font-size:13px;font-weight:600;color:#2C2517;text-decoration:none;display:block;margin-bottom:2px;">${j.title}</a>
            <span style="font-size:11px;color:#8C8474;">${location}</span>
          </td>
          <td width="60" align="right" valign="middle" style="padding:12px 14px;">
            <a href="${j.url}" style="font-size:11px;font-weight:500;color:#946B2D;text-decoration:none;">View &rarr;</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function buildHtml(newArticles, newJobs) {
  const weekLabel = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>AMI Observatory — Weekly Digest</title>
</head>
<body style="margin:0;padding:0;background:#F0EDE6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0EDE6;">
    <tr><td align="center" style="padding:40px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFCF5;border-radius:8px;overflow:hidden;border:1px solid #D5CEBD;">

        <!-- Accent bar -->
        <tr>
          <td style="height:3px;background:linear-gradient(90deg,#C8962E 0%,#D4A854 40%,#E8D5A8 100%);font-size:0;line-height:0;">&nbsp;</td>
        </tr>

        <!-- Header -->
        <tr>
          <td style="padding:32px 36px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <table cellpadding="0" cellspacing="0"><tr>
                    <td width="8" valign="middle">
                      <div style="width:8px;height:8px;border-radius:50%;background:#C8962E;"></div>
                    </td>
                    <td style="padding-left:8px;">
                      <span style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#946B2D;font-weight:600;">AMI Observatory</span>
                    </td>
                  </tr></table>
                </td>
                <td align="right" valign="middle">
                  <span style="font-size:11px;color:#8C8474;">by The French Tech Journal</span>
                </td>
              </tr>
            </table>
            <h1 style="margin:16px 0 0;font-size:24px;font-weight:500;color:#2C2517;line-height:1.25;font-family:Georgia,'Times New Roman',serif;">Weekly digest</h1>
            <p style="margin:6px 0 0;font-size:13px;color:#8C8474;">Week of ${weekLabel}</p>
          </td>
        </tr>

        <!-- Divider -->
        <tr>
          <td style="padding:0 36px;">
            <div style="height:1px;background:#D5CEBD;"></div>
          </td>
        </tr>

        ${newArticles.length > 0 ? `
        <!-- News section -->
        <tr>
          <td style="padding:24px 36px 0;">
            <p style="margin:0 0 16px;font-size:11px;font-weight:600;color:#946B2D;text-transform:uppercase;letter-spacing:0.08em;">News &amp; coverage</p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 36px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              ${newArticles.map(articleRow).join("")}
            </table>
          </td>
        </tr>` : ""}

        ${newJobs.length > 0 ? `
        <!-- Divider before jobs -->
        <tr>
          <td style="padding:8px 36px 0;">
            <div style="height:1px;background:#D5CEBD;"></div>
          </td>
        </tr>

        <!-- Jobs section -->
        <tr>
          <td style="padding:24px 36px 0;">
            <p style="margin:0 0 16px;font-size:11px;font-weight:600;color:#946B2D;text-transform:uppercase;letter-spacing:0.08em;">Open positions</p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 36px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              ${newJobs.map(jobRow).join("")}
            </table>
          </td>
        </tr>` : ""}

        <!-- CTA button -->
        <tr>
          <td align="center" style="padding:28px 36px 8px;">
            <a href="https://ami.frenchtechjournal.com" style="display:inline-block;padding:10px 28px;background:#946B2D;color:#FFFCF5;font-size:13px;font-weight:600;border-radius:6px;text-decoration:none;">Read more at AMI Observatory</a>
          </td>
        </tr>

        <!-- Divider before footer -->
        <tr>
          <td style="padding:20px 36px 0;">
            <div style="height:1px;background:#D5CEBD;"></div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td align="center" style="padding:20px 36px 28px;">
            <p style="margin:0;font-size:11px;color:#8C8474;line-height:1.6;">
              You&rsquo;re receiving this because you subscribed at
              <a href="https://frenchtechjournal.com" style="color:#946B2D;text-decoration:none;">frenchtechjournal.com</a>.
              &nbsp;&middot;&nbsp;
              <a href="{{unsubscribe_url}}" style="color:#946B2D;text-decoration:none;">Unsubscribe</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
