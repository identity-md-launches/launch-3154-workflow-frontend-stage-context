import {
  useEffect,
  useRef,
  useState,
  useId,
  type ReactNode,
  type InputHTMLAttributes,
} from "react";
import { getAddress, type Address } from "viem";
import { useRuntime, useTx, type TxSpec } from "./context";
export function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const before = document.activeElement as HTMLElement;
    ref.current?.showModal();
    return () => {
      ref.current?.close();
      before?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
      aria-labelledby={titleId}
    >
      <div className="dialog-body">
        <div className="section-head">
          <h2 id={titleId}>{title}</h2>
          <button
            aria-label="Close dialog"
            onClick={close}
            className="icon-button"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
export function AddressText({ address }: { address: Address }) {
  const r = useRuntime(),
    [copyStatus, setCopyStatus] = useState("Copy");
  useEffect(() => setCopyStatus("Copy"), [address]);
  return (
    <div className="address">
      <a
        href={`${r.deployment.network.explorer}/address/${address}`}
        target="_blank"
        rel="noreferrer"
      >
        {getAddress(address)}
      </a>
      <button
        onClick={async () => {
          try {
            if (!navigator.clipboard) throw Error("Clipboard unavailable");
            await navigator.clipboard.writeText(getAddress(address));
            setCopyStatus("Copied");
          } catch {
            setCopyStatus("Select to copy");
          }
        }}
        aria-label={`Copy ${address}`}
      >
        {copyStatus}
      </button>
    </div>
  );
}
export function Field({
  label,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const id =
    props.id ?? props.name ?? label.toLowerCase().replace(/[^a-z0-9]/g, "-");
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        {...props}
        id={id}
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}
export function Action({
  spec,
  disabled,
  children,
  primary = false,
}: {
  spec: TxSpec | (() => TxSpec);
  disabled?: boolean;
  children: ReactNode;
  primary?: boolean;
}) {
  const tx = useTx();
  const [error, setError] = useState("");
  const label = typeof spec === "function" ? "" : spec.label;
  const active = tx.busy && tx.state.label === label;
  return (
    <>
      <button
        className={primary ? "primary" : ""}
        disabled={disabled || tx.busy}
        onClick={() => {
          try {
            setError("");
            void tx.prepare(typeof spec === "function" ? spec() : spec);
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        {active ? `${label}…` : children}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
export function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={`notice ${error ? "error" : ""}`}
      role={error ? "alert" : undefined}
    >
      {children}
    </div>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <svg
        aria-hidden="true"
        width="44"
        height="44"
        viewBox="0 0 44 44"
        fill="none"
      >
        <path
          d="M8 34V10m0 24h28M14 27l7-8 6 3 9-12"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path d="M29 10h7v7" stroke="currentColor" strokeWidth="2" />
      </svg>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
