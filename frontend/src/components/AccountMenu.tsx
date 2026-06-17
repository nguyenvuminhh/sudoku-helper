"use client";

import { LogIn, LogOut, Mail, UserCircle } from "lucide-react";
import { useState, type FormEvent } from "react";

import type { SupabaseAccountState } from "../hooks/useSupabaseAccount";

export function AccountMenu({ account }: { account: SupabaseAccountState }) {
  const [open, setOpen] = useState(false);
  const [draftName, setDraftName] = useState(account.displayName);
  const [signInEmail, setSignInEmail] = useState("");
  const [signInNotice, setSignInNotice] = useState<string | null>(null);
  const [signInBusy, setSignInBusy] = useState(false);
  const cloudUnavailable = account.status === "unavailable";
  const cloudUser = account.status === "signed-in" && account.user?.isAnonymous === false;
  const buttonLabel = cloudUser ? account.displayName : "Sign in";
  const statusLabel = cloudUnavailable
    ? "Cloud stats unavailable"
    : account.status === "loading"
      ? "Checking sign-in"
      : cloudUser
        ? "Signed in"
        : "Local guest mode";

  async function handleNameSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await account.updateName(draftName);
  }

  async function handleSignInSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSignInNotice(null);
    setSignInBusy(true);
    try {
      await account.signInWithEmail(signInEmail);
      setSignInNotice("Check your email for the sign-in link.");
    } catch {
      // The hook owns the account error message shown below the summary.
    } finally {
      setSignInBusy(false);
    }
  }

  return (
    <div className="account-menu">
      <button
        type="button"
        className="account-pill"
        aria-label={cloudUser ? `${buttonLabel} account` : "Sign in"}
        aria-expanded={open}
        onClick={() => {
          setDraftName(account.displayName);
          setSignInNotice(null);
          setOpen((current) => !current);
        }}
      >
        {cloudUser ? <UserCircle size={15} /> : <LogIn size={15} />}
        <span>{buttonLabel}</span>
      </button>

      {open ? (
        <div className="account-pop" role="dialog" aria-label="Account">
          <div className="account-summary">
            <strong>{cloudUser ? account.displayName : "Sign in"}</strong>
            <span>{statusLabel}</span>
          </div>

          {account.error ? <p className="account-error">{account.error}</p> : null}

          {cloudUser ? (
            <>
              <form className="account-form" onSubmit={handleNameSubmit}>
                <label htmlFor="display-name">Display name</label>
                <input
                  id="display-name"
                  value={draftName}
                  maxLength={40}
                  onChange={(event) => setDraftName(event.target.value)}
                />
                <button type="submit" disabled={!draftName.trim()}>
                  Save name
                </button>
              </form>

              <button type="button" className="account-action" onClick={() => void account.signOut()}>
                <LogOut size={15} />
                Sign out
              </button>
            </>
          ) : (
            <>
              <form className="account-form" onSubmit={handleSignInSubmit}>
                <label htmlFor="sign-in-email">Email</label>
                <input
                  id="sign-in-email"
                  type="email"
                  autoComplete="email"
                  value={signInEmail}
                  disabled={signInBusy}
                  onChange={(event) => setSignInEmail(event.target.value)}
                />
                <button type="submit" disabled={signInBusy || !signInEmail.trim()}>
                  <Mail size={15} />
                  {signInBusy ? "Sending..." : "Send sign-in link"}
                </button>
              </form>

              {signInNotice ? <p className="account-success">{signInNotice}</p> : null}
              <p className="account-note">Guest play stays local.</p>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
