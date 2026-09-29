function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export function buildPasswordResetEmail(resetLink: string) {
  return {
    subject: 'Reset your Prompt Library password',
    text: `Use this link within 30 minutes to choose a new password:\n\n${resetLink}\n\nIf you did not request this, ignore this email.`,
    html: `<p>Use this link within 30 minutes to choose a new password:</p><p><a href="${escapeHtml(resetLink)}">Choose a new password</a></p><p>If you did not request this, ignore this email.</p>`,
  }
}
