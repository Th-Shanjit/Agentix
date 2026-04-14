import nodemailer from "nodemailer";

type DigestItem = {
  company: string;
  role: string;
  link: string;
  location: string | null;
  matchedRole: string | null;
  postedAt: Date;
};

function getTransport() {
  const server = process.env.EMAIL_SERVER?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!server || !from) {
    throw new Error("EMAIL_SERVER and EMAIL_FROM must be configured.");
  }
  return {
    from,
    transport: nodemailer.createTransport(server),
  };
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export async function sendAlertsDigestEmail(params: {
  to: string;
  userName?: string | null;
  items: DigestItem[];
}) {
  if (params.items.length === 0) return;
  const { from, transport } = getTransport();
  const introName = params.userName?.trim() || "there";
  const subject =
    params.items.length === 1
      ? "Agentix alert: 1 relevant opening found"
      : `Agentix alert: ${params.items.length} relevant openings found`;

  const linesText = params.items.map((it) => {
    const role = it.matchedRole ? `${it.role} (matched ${it.matchedRole})` : it.role;
    const loc = it.location ? ` · ${it.location}` : "";
    return `- ${it.company}: ${role}${loc}\n  ${it.link}`;
  });
  const text = `Hi ${introName},\n\nNew relevant openings were detected from tracked career pages:\n\n${linesText.join(
    "\n"
  )}\n\nOpen your board: /board\n\n- Agentix`;

  const linesHtml = params.items
    .map((it) => {
      const role = escapeHtml(it.role);
      const company = escapeHtml(it.company);
      const matched = it.matchedRole
        ? ` <span style="color:#666;">(matched ${escapeHtml(it.matchedRole)})</span>`
        : "";
      const loc = it.location ? ` · ${escapeHtml(it.location)}` : "";
      return `<li><strong>${company}</strong>: ${role}${matched}${loc}<br/><a href="${it.link}">${it.link}</a></li>`;
    })
    .join("");

  const html = `<p>Hi ${escapeHtml(
    introName
  )},</p><p>New relevant openings were detected from tracked career pages:</p><ul>${linesHtml}</ul><p>- Agentix</p>`;

  await transport.sendMail({
    from,
    to: params.to,
    subject,
    text,
    html,
  });
}
