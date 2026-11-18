const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { defineSecret } = require("firebase-functions/params");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const nodemailer = require("nodemailer");
const crypto = require("node:crypto");

initializeApp();

const db = getFirestore();
const REGION = "asia-southeast1";
const HEAD_EMAIL = "pisit.seub@gmail.com";
const SENDER_NAME = "TDA Project Tracker";
const SMTP_USER = defineSecret("SMTP_USER");
const SMTP_APP_PASSWORD = defineSecret("SMTP_APP_PASSWORD");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function statusName(value) {
  const status = Number(value);
  return ["Not started", "In progress", "Completed"][status] || "Unknown";
}

function mailTransport() {
  const user = SMTP_USER.value();
  const password = SMTP_APP_PASSWORD.value();
  if (!user || !password) {
    throw new Error("Email secrets are missing. Set SMTP_USER and SMTP_APP_PASSWORD.");
  }
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass: password }
  });
}

async function sendEmail({ subject, text, html }) {
  const user = SMTP_USER.value();
  const transporter = mailTransport();
  return transporter.sendMail({
    from: { name: SENDER_NAME, address: user },
    to: HEAD_EMAIL,
    subject,
    text,
    html
  });
}

function eventRow({ type, employee, project, beforeStatus, afterStatus }) {
  const isNew = type === "new";
  const title = isNew ? "New project submitted" : "Project status changed";
  const details = [
    ["Employee", employee],
    ["Customer", project.customer || "—"],
    ["Project name", project.name || "(Untitled project)"],
    ["Job type", project.job || "Service"],
    ["Status", isNew ? statusName(project.status) : `${statusName(beforeStatus)} → ${statusName(afterStatus)}`],
    ["Start date", project.start || "—"],
    ["Due date", project.end || "—"],
    ["Remark", project.desc || "—"]
  ];
  const text = `${title}\n\n${details.map(([label, value]) => `${label}: ${value}`).join("\n")}`;
  const html = `<h2 style="margin:0 0 16px;color:#075985">${escapeHtml(title)}</h2>
    <table cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:640px">
      ${details.map(([label, value]) => `<tr><td style="border-bottom:1px solid #e2e8f0;color:#64748b;width:140px">${escapeHtml(label)}</td><td style="border-bottom:1px solid #e2e8f0;color:#0f172a">${escapeHtml(value)}</td></tr>`).join("")}
    </table>
    <p style="margin-top:20px;color:#64748b;font-size:12px">Automatic notification from TDA Project Tracker.</p>`;
  return { title, text, html };
}

exports.notifyProjectChanges = onDocumentWritten({
  document: "pjt/{uid}",
  region: REGION,
  secrets: [SMTP_USER, SMTP_APP_PASSWORD]
}, async (event) => {
  const before = event.data?.before?.exists ? event.data.before.data() : null;
  const after = event.data?.after?.exists ? event.data.after.data() : null;
  if (!after) return;

  const oldItems = new Map((before?.items || []).filter(p => p && p.id != null).map(p => [String(p.id), p]));
  const newItems = (after.items || []).filter(p => p && p.id != null);
  const employee = String(after.name || "Team member");
  const changes = [];

  for (const project of newItems) {
    const previous = oldItems.get(String(project.id));
    if (!previous) {
      changes.push(eventRow({ type: "new", employee, project }));
    } else if (String(previous.status) !== String(project.status)) {
      changes.push(eventRow({
        type: "status",
        employee,
        project,
        beforeStatus: previous.status,
        afterStatus: project.status
      }));
    }
  }

  if (!changes.length) return;

  // Firestore triggers are delivered at least once. A stable event key prevents duplicate mail.
  const eventKey = crypto.createHash("sha256").update(String(event.id)).digest("hex");
  const eventRef = db.collection("mailEvents").doc(eventKey);
  const alreadyHandled = await db.runTransaction(async (tx) => {
    const snap = await tx.get(eventRef);
    if (snap.exists) return true;
    tx.create(eventRef, {
      type: "project-change",
      state: "sending",
      createdAt: FieldValue.serverTimestamp()
    });
    return false;
  });
  if (alreadyHandled) return;

  try {
    const subject = changes.length === 1
      ? `[TDA Tracker] ${changes[0].title}`
      : `[TDA Tracker] ${changes.length} project updates`;
    const text = changes.map(x => x.text).join("\n\n--------------------\n\n");
    const html = `<div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;padding:20px">
      <div style="background:#0369a1;color:white;padding:16px 20px;border-radius:12px 12px 0 0">
        <strong style="font-size:18px">${SENDER_NAME}</strong>
        <div style="font-size:13px;opacity:.9">Project notification</div>
      </div>
      <div style="border:1px solid #e2e8f0;border-top:0;padding:20px;border-radius:0 0 12px 12px">
        ${changes.map(x => `<section style="padding:0 0 18px;margin:0 0 18px;border-bottom:1px solid #e2e8f0">${x.html}</section>`).join("")}
      </div></div>`;
    await sendEmail({ subject, text, html });
    await eventRef.update({ state: "sent", sentAt: FieldValue.serverTimestamp() });
  } catch (error) {
    await eventRef.delete().catch(() => {});
    console.error("Project notification email failed:", error);
    throw error;
  }
});

function bangkokDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

exports.notifyOverdueProjects = onSchedule({
  schedule: "0 9 * * *",
  timeZone: "Asia/Bangkok",
  region: REGION,
  secrets: [SMTP_USER, SMTP_APP_PASSWORD]
}, async () => {
  const today = bangkokDate();
  const snapshot = await db.collection("pjt").get();
  const overdue = [];

  for (const doc of snapshot.docs) {
    const data = doc.data() || {};
    const employee = String(data.name || "Team member");
    for (const project of (data.items || [])) {
      if (!project || project.id == null || !project.end) continue;
      if (Number(project.status) === 2 || String(project.end) >= today) continue;
      const key = crypto.createHash("sha256")
        .update(`${doc.id}:${project.id}:${project.end}`)
        .digest("hex");
      const sentRef = db.collection("overdueMailDedupe").doc(key);
      const sent = await sentRef.get();
      if (!sent.exists) overdue.push({ employee, project, sentRef });
    }
  }

  if (!overdue.length) {
    console.log("No new overdue projects to notify.");
    return;
  }

  const rows = overdue.map(({ employee, project }) => ({
    employee,
    customer: String(project.customer || "—"),
    name: String(project.name || "(Untitled project)"),
    job: String(project.job || "Service"),
    due: String(project.end),
    status: statusName(project.status),
    desc: String(project.desc || "—")
  }));

  const text = [
    `Overdue project summary — ${today}`,
    "",
    ...rows.map((p, index) => [
      `${index + 1}. ${p.name}`,
      `Customer: ${p.customer}`,
      `Employee: ${p.employee}`,
      `Job type: ${p.job}`,
      `Due date: ${p.due}`,
      `Status: ${p.status}`,
      `Remark: ${p.desc}`
    ].join("\n"))
  ].join("\n\n");

  const html = `<div style="font-family:Arial,sans-serif;max-width:720px;margin:auto;padding:20px">
    <div style="background:#b91c1c;color:white;padding:16px 20px;border-radius:12px 12px 0 0">
      <strong style="font-size:18px">${SENDER_NAME}</strong>
      <div style="font-size:13px">Overdue project summary · ${escapeHtml(today)}</div>
    </div>
    <div style="border:1px solid #e2e8f0;border-top:0;padding:20px;border-radius:0 0 12px 12px">
      <p>There are <strong>${rows.length}</strong> newly overdue project(s) that have not yet been reported.</p>
      <table cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:14px">
        <tr style="text-align:left;background:#f1f5f9"><th>Employee</th><th>Customer</th><th>Project name</th><th>Due date</th><th>Status</th></tr>
        ${rows.map(p => `<tr><td style="border-bottom:1px solid #e2e8f0">${escapeHtml(p.employee)}</td><td style="border-bottom:1px solid #e2e8f0">${escapeHtml(p.customer)}</td><td style="border-bottom:1px solid #e2e8f0">${escapeHtml(p.name)}<br><small>${escapeHtml(p.job)}</small></td><td style="border-bottom:1px solid #e2e8f0;color:#b91c1c">${escapeHtml(p.due)}</td><td style="border-bottom:1px solid #e2e8f0">${escapeHtml(p.status)}</td></tr>`).join("")}
      </table>
      <p style="color:#64748b;font-size:12px;margin-top:20px">Automatic daily notification from TDA Project Tracker.</p>
    </div></div>`;

  await sendEmail({
    subject: `[TDA Tracker] ${rows.length} overdue project(s) — ${today}`,
    text,
    html
  });

  const batch = db.batch();
  for (const item of overdue) {
    batch.set(item.sentRef, {
      employee: item.employee,
      projectId: String(item.project.id),
      projectName: String(item.project.name || ""),
      dueDate: String(item.project.end),
      sentAt: FieldValue.serverTimestamp()
    });
  }
  await batch.commit();
});
