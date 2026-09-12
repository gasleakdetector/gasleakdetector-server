import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const esc = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

export async function sendAlert({ deviceId, ppm, timestamp }) {
  try {
    await resend.emails.send({
      from: 'Gas Monitor <onboarding@resend.dev>',
      to: process.env.ALERT_EMAIL,
      subject: `🚨 GAS LEAK DETECTED - ${deviceId}`,
      html: `
        <h2 style="color:#e74c3c">⚠️ DANGER LEVEL DETECTED</h2>
        <p><strong>Device:</strong> ${esc(deviceId)}</p>
        <p><strong>Gas PPM:</strong> ${esc(ppm)}</p>
        <p><strong>Time:</strong> ${new Date(timestamp).toLocaleString()}</p>
        <p style="color:#c0392b">Immediate action required!</p>
      `
    });
  } catch (error) {
    console.error('[email] sendAlert failed:', error.message);
  }
}
