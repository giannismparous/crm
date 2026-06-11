import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { useBufferedTextField } from "../hooks/useBufferedTextField";

type CommonProps = {
  value: string;
  onCommit: (value: string) => void | Promise<void>;
  /** Changes when the edited entity changes (e.g. person id, task id). */
  entityKey: string;
  /** Trim leading/trailing whitespace on blur before commit. */
  trim?: boolean;
};

export function BufferedTextInput({
  value,
  onCommit,
  entityKey,
  trim,
  ...rest
}: CommonProps & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange">) {
  const { setDraft: _setDraft, commit: _commit, ...fieldProps } = useBufferedTextField(
    value,
    onCommit,
    entityKey,
    { trim }
  );
  return <input {...rest} {...fieldProps} />;
}

export function BufferedTextArea({
  value,
  onCommit,
  entityKey,
  trim,
  ...rest
}: CommonProps & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "defaultValue" | "onChange">) {
  const { setDraft: _setDraft, commit: _commit, ...fieldProps } = useBufferedTextField(
    value,
    onCommit,
    entityKey,
    { trim }
  );
  return <textarea {...rest} {...fieldProps} />;
}
