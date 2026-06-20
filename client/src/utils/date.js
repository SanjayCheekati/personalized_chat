const DAY_MS = 1000 * 60 * 60 * 24;

export function groupMessagesByDate(messages) {
  if (!messages || messages.length === 0) {
    return [];
  }

  const groups = [];
  let lastDate = null;

  messages.forEach((message) => {
    const messageDate = new Date(message.timestamp);
    if (!lastDate || !isSameDay(lastDate, messageDate)) {
      groups.push({ type: "date", date: messageDate, id: messageDate.getTime() });
    }
    groups.push({ type: "message", ...message });
    lastDate = messageDate;
  });

  return groups;
}

export function isSameDay(date1, date2) {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

export function formatDateSeparator(date) {
  const now = new Date();
  if (isSameDay(date, now)) {
    return "Today";
  }

  const yesterday = new Date(now.getTime() - DAY_MS);
  if (isSameDay(date, yesterday)) {
    return "Yesterday";
  }

  const isThisYear = date.getFullYear() === now.getFullYear();
  if (isThisYear) {
    return date.toLocaleDateString([], { month: "long", day: "numeric" });
  }

  return date.toLocaleDateString([], {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}
