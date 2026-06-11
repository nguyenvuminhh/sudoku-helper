export function firstImageFile(data: DataTransfer | null): File | null {
  if (!data) {
    return null;
  }

  for (const file of Array.from(data.files)) {
    if (file.type.startsWith("image/")) {
      return file;
    }
  }

  for (const item of Array.from(data.items)) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) {
        return file;
      }
    }
  }

  return null;
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || target.isContentEditable;
}
