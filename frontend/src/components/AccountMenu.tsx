"use client";

import { LogIn, LogOut, UserCircle } from "lucide-react";
import { useState, type FormEvent } from "react";

import type { SupabaseAccountState } from "../hooks/useSupabaseAccount";

export function AccountMenu({ account }: { account: SupabaseAccountState }) {
  const [open, setOpen] = useState(false);
  const [draftName, setDraftName] = useState(account.displayName);
  const cloudUnavailable = account.status === "unavailable";

  async function handleNameSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await account.updateName(draftName);
  }

  return (
    <div className="account-menu">
      <button
        type="button"
        className="account-pill"
        aria-label={`${account.displayName} account`}
        aria-expanded={open}
        onClick={() => {
          setDraftName(account.displayName);
          setOpen((current) => !current);
        }}
      >
        <UserCircle size={15} />
        <span>{account.displayName}</span>
      </button>

      {open ? (
        <div className="account-pop" role="dialog" aria-label="Account">
          <div className="account-summary">
            <strong>{account.displayName}</strong>
            <span>
              {cloudUnavailable
                ? "Cloud stats unavailable"
                : account.status === "loading"
                  ? "Connecting guest session"
                  : account.user?.isAnonymous !== false
                    ? "Guest session"
                    : "Signed in"}
            </span>
          </div>

          {account.error ? <p className="account-error">{account.error}</p> : null}

          <form className="account-form" onSubmit={handleNameSubmit}>
            <label htmlFor="display-name">Display name</label>
            <input
              id="display-name"
              value={draftName}
              maxLength={40}
              disabled={cloudUnavailable || !account.user}
              onChange={(event) => setDraftName(event.target.value)}
            />
            <button type="submit" disabled={cloudUnavailable || !account.user || !draftName.trim()}>
              Save name
            </button>
          </form>

          {account.user ? (
            <button type="button" className="account-action" onClick={() => void account.signOut()}>
              <LogOut size={15} />
              Sign out
            </button>
          ) : (
            <button
              type="button"
              className="account-action"
              disabled={cloudUnavailable}
              onClick={() => void account.ensureAccount()}
            >
              <LogIn size={15} />
              Start guest session
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
