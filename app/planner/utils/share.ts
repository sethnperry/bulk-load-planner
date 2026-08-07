// Shared Copy/Text/Email helpers for plain-text reports (Terminal Cards,
// and any future share-sheet report) -- same mechanism already duplicated
// per-modal in LoadReportModal/RecordHistoryModal/ScaleHistoryModal, pulled
// out here since this is now the 4th consumer.

export function shareViaClipboard(text: string, onCopied: () => void) {
  navigator.clipboard.writeText(text).then(onCopied).catch(() => window.prompt("Copy this report:", text));
}
export function shareViaSMS(text: string) {
  window.location.href = `sms:?&body=${encodeURIComponent(text)}`;
}
export function shareViaEmail(subject: string, text: string) {
  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
}
