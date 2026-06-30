// Image node that persists a stable `objectKey` (not the signed src).
import Image from "@tiptap/extension-image";

export const NoteImage = Image.extend({
  name: "image",
  addAttributes() {
    return {
      ...this.parent?.(),
      objectKey: {
        default: null,
        // objectKey is persisted in the node JSON; src is transient (resolved at runtime).
        renderHTML: (attrs) => (attrs.objectKey ? { "data-object-key": attrs.objectKey } : {}),
        parseHTML: (el) => el.getAttribute("data-object-key"),
      },
    };
  },
});
