import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendAlert({ deviceId, ppm, timestamp }) {
  try {
    await resend.emails.send({
      from: 'Gas Monitor <onboarding@resend.dev>',
      to: process.env.ALERT_EMAIL,
      subject: `🚨 GAS LEAK DETECTED - ${deviceId}`,
      html: `
        <h2 style="color:#e74c3c">⚠️ DANGER LEVEL DETECTED</h2>
        <p><strong>Device:</strong> ${deviceId}</p>
        <p><strong>Gas PPM:</strong> ${ppm}</p>
        <p><strong>Time:</strong> ${new Date(timestamp).toLocaleString()}</p>
        <p style="color:#c0392b">Immediate action required!</p>
      `
    });
  } catch (error) {
    console.error('[email] sendAlert failed:', error.message);
  }
}
