"use client";

import { LogOut, UserCircle } from "lucide-react";
import { useState, type FormEvent } from "react";

import type { SupabaseAccountState } from "../hooks/useSupabaseAccount";

export function AccountMenu({ account }: { account: SupabaseAccountState }) {
  const [open, setOpen] = useState(false);
  const [draftName, setDraftName] = useState(account.displayName);
  const cloudUnavailable = account.status === "unavailable";
  const cloudUser = account.status === "signed-in" && account.user?.isAnonymous === false;

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
                  ? "Checking sign-in"
                  : cloudUser
                    ? "Signed in"
                    : "Local guest mode"}
            </span>
          </div>

          {account.error ? <p className="account-error">{account.error}</p> : null}

          <form className="account-form" onSubmit={handleNameSubmit}>
            <label htmlFor="display-name">Display name</label>
            <input
              id="display-name"
              value={draftName}
              maxLength={40}
              disabled={!cloudUser}
              onChange={(event) => setDraftName(event.target.value)}
            />
            <button type="submit" disabled={!cloudUser || !draftName.trim()}>
              Save name
            </button>
          </form>

          {cloudUser ? (
            <button type="button" className="account-action" onClick={() => void account.signOut()}>
              <LogOut size={15} />
              Sign out
            </button>
          ) : (
            <p className="account-note">Guest play stays local.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
