import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Download, KeyRound, LogOut, Upload, UserPen, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { DataImportPreviewResponse, DataImportReviewOverride } from "@shared/routes";
import {
  useAuthSession,
  useAuthSessions,
  useChangePassword,
  useChangeUsername,
  useDeleteAccount,
  useLogout,
  useLogoutOtherSessions,
} from "@/hooks/use-auth";
import { useCommitImportStage, useExportData, usePreviewImportData } from "@/hooks/use-data-transfer";

type TrackerSettingsSection = "account" | "import-export";
type ImportReviewOverrideDraft = Omit<DataImportReviewOverride, "sourceKey">;
const FREQUENCY_PERIOD_OPTIONS = [
  { value: "day", label: "Jour" },
  { value: "week", label: "Semaine" },
  { value: "month", label: "Mois" },
  { value: "quarter", label: "Trimestre" },
  { value: "year", label: "Année" },
] as const;
const QUANT_UNIT_OPTIONS = [
  { value: "count", label: "Unité" },
  { value: "km", label: "km" },
  { value: "hours", label: "h" },
  { value: "minutes", label: "min" },
  { value: "time_of_day", label: "H de la journée" },
  { value: "custom", label: "Custom" },
] as const;
const QUANT_GOAL_TYPE_OPTIONS = [
  { value: "at_least", label: "Au moins" },
  { value: "at_most", label: "Au plus" },
] as const;

function fileToBase64(file: File) {
  return file.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  });
}

function formatSessionDate(value: string | null) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString();
}

function formatSessionDevice(session: {
  browser: string | null;
  os: string | null;
  userAgent: string | null;
}) {
  const parts = [session.browser, session.os].filter(Boolean);
  if (parts.length > 0) return parts.join(" • ");
  if (session.userAgent) return session.userAgent;
  return "Appareil inconnu";
}

export function TrackerSettingsModal({
  open,
  onClose,
  initialSection = "account",
}: {
  open: boolean;
  onClose: () => void;
  initialSection?: TrackerSettingsSection;
}) {
  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState<TrackerSettingsSection>(initialSection);
  const authSession = useAuthSession();
  const changeUsername = useChangeUsername();
  const changePassword = useChangePassword();
  const authSessions = useAuthSessions(open && activeSection === "account");
  const logoutOtherSessions = useLogoutOtherSessions();
  const deleteAccount = useDeleteAccount();
  const logout = useLogout();
  const exportData = useExportData();
  const previewImport = usePreviewImportData();
  const commitImport = useCommitImportStage();

  const [username, setUsername] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [importError, setImportError] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<DataImportPreviewResponse | null>(null);
  const [reviewOverrides, setReviewOverrides] = useState<Record<string, ImportReviewOverrideDraft>>({});
  const [changePasswordLocalError, setChangePasswordLocalError] = useState<string | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmPhrase, setDeleteConfirmPhrase] = useState("");
  const [showDeleteForm, setShowDeleteForm] = useState(false);
  const [showChangeUsernameForm, setShowChangeUsernameForm] = useState(false);
  const [showChangePasswordForm, setShowChangePasswordForm] = useState(false);
  const [expandedSessionSid, setExpandedSessionSid] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const currentUser = authSession.data?.authenticated ? authSession.data.user : null;

  useEffect(() => {
    if (!open) return;
    setActiveSection(initialSection);
  }, [initialSection, open]);

  useEffect(() => {
    if (!open) return;
    setUsername(currentUser?.username ?? "");
  }, [currentUser?.username, open]);

  useEffect(() => {
    if (!open) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSelectedFile(null);
      setImportError(null);
      setImportPreview(null);
      setReviewOverrides({});
      setChangePasswordLocalError(null);
      setDeletePassword("");
      setDeleteConfirmPhrase("");
      setShowDeleteForm(false);
      setShowChangeUsernameForm(false);
      setShowChangePasswordForm(false);
      setExpandedSessionSid(null);
      changeUsername.reset();
      changePassword.reset();
      logoutOtherSessions.reset();
      deleteAccount.reset();
      exportData.reset();
      previewImport.reset();
      commitImport.reset();
    }
  }, [open]);

  const changeUsernameError = changeUsername.error instanceof Error ? changeUsername.error.message : null;
  const changePasswordError =
    changePasswordLocalError || (changePassword.error instanceof Error ? changePassword.error.message : null);
  const importMutationError =
    importError ||
    (previewImport.error instanceof Error ? previewImport.error.message : null) ||
    (commitImport.error instanceof Error ? commitImport.error.message : null);
  const deleteAccountError = deleteAccount.error instanceof Error ? deleteAccount.error.message : null;

  const importFileHint = useMemo(() => {
    if (!selectedFile) return "Formats supportés: ZIP CSV Habitudes/Loop, export JSON Pixel Heart Tracker";
    return `${selectedFile.name} • ${(selectedFile.size / 1024).toFixed(1)} KB`;
  }, [selectedFile]);

  const reviewItemsNeedingAttention = useMemo(
    () => (importPreview?.reviewItems ?? []).filter((item) => item.requiresReview),
    [importPreview],
  );

  const resetImportReviewState = () => {
    setImportError(null);
    setImportPreview(null);
    setReviewOverrides({});
    previewImport.reset();
    commitImport.reset();
  };

  const setReviewOverride = (sourceKey: string, patch: Partial<ImportReviewOverrideDraft>) => {
    setReviewOverrides((current) => ({
      ...current,
      [sourceKey]: {
        ...(current[sourceKey] ?? {}),
        ...patch,
      },
    }));
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[250] bg-black/55 px-4 py-6 flex items-center justify-center">
      <div className="w-full max-w-2xl pixel-box bg-card/80 p-4 sm:p-5 relative max-h-[90vh] flex flex-col">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 pixel-button px-2 py-1 bg-transparent border-primary text-foreground"
          aria-label="Close settings"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="space-y-4 pr-12 flex-none">
          <div>
            <h2 className="font-display text-sm sm:text-base text-foreground glow-text">Tracker Settings</h2>
            <p className="font-body text-lg text-muted-foreground">
              {currentUser ? `Connecté en tant que ${currentUser.username}${currentUser.isAdmin ? " (admin)" : ""}` : "Session"}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveSection("account")}
              className={`pixel-button px-3 py-2 flex items-center gap-2 ${
                activeSection === "account"
                  ? "bg-primary/20 border-accent text-foreground"
                  : "bg-transparent border-primary text-muted-foreground"
              }`}
            >
              <UserPen className="w-4 h-4" />
              <span className="text-[10px] sm:text-xs">Account</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSection("import-export")}
              className={`pixel-button px-3 py-2 flex items-center gap-2 ${
                activeSection === "import-export"
                  ? "bg-primary/20 border-accent text-foreground"
                  : "bg-transparent border-primary text-muted-foreground"
              }`}
            >
              <Upload className="w-4 h-4" />
              <span className="text-[10px] sm:text-xs">Import / Export</span>
            </button>
          </div>
        </div>

        <div className="mt-4 min-h-0 overflow-y-auto overscroll-contain pr-1">
          {activeSection === "account" ? (
            <div className="space-y-4">
              <div className="pixel-box p-4 bg-card/30">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <UserPen className="w-4 h-4 text-foreground" />
                    <p className="font-display text-xs text-foreground">Changer de pseudo</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowChangeUsernameForm((v) => !v)}
                    className="pixel-button px-3 py-2 bg-transparent border-primary text-foreground"
                  >
                    {showChangeUsernameForm ? "Masquer" : "Changer le pseudo"}
                  </button>
                </div>
                {showChangeUsernameForm ? (
                  <form
                    className="space-y-3 mt-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      changeUsername.mutate(
                        { username },
                        {
                          onSuccess: () => {
                            toast({ title: "Pseudo mis à jour" });
                            setShowChangeUsernameForm(false);
                          },
                        },
                      );
                    }}
                  >
                    <input
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="pixel-input w-full px-3 py-3 bg-card/30 text-foreground"
                      maxLength={64}
                      required
                    />
                    {changeUsernameError ? <p className="font-body text-lg text-destructive">{changeUsernameError}</p> : null}
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={changeUsername.isPending}
                        className="pixel-button px-3 py-2 bg-transparent border-primary text-foreground disabled:opacity-50"
                      >
                        {changeUsername.isPending ? "Saving..." : "Save username"}
                      </button>
                    </div>
                  </form>
                ) : null}
              </div>

              <div className="pixel-box p-4 bg-card/30">
                <div className="flex items-center gap-2 mb-2">
                  <UserPen className="w-4 h-4 text-foreground" />
                  <p className="font-display text-xs text-foreground">Sessions actives</p>
                </div>
                {authSessions.isLoading ? (
                  <p className="font-body text-lg text-muted-foreground">Chargement des sessions...</p>
                ) : authSessions.error instanceof Error ? (
                  <p className="font-body text-lg text-destructive">{authSessions.error.message}</p>
                ) : (
                  <div className="space-y-2">
                    {(authSessions.data?.sessions ?? []).map((session) => (
                      <div
                        key={session.sid}
                        className="border-2 border-border/35 bg-card/15 hover:bg-card/20 transition-colors overflow-hidden"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedSessionSid((current) => (current === session.sid ? null : session.sid))
                          }
                          className="w-full px-3 py-2.5 flex items-center justify-between gap-3 text-left"
                        >
                          <span className="font-display text-[10px] sm:text-xs text-foreground">
                            {session.isCurrent ? "Cet appareil" : "Autre appareil"}
                          </span>
                          <div className="flex items-center gap-2">
                            {expandedSessionSid === session.sid ? (
                              <ChevronDown className="w-4 h-4 text-foreground" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-foreground" />
                            )}
                          </div>
                        </button>
                        {expandedSessionSid === session.sid ? (
                          <div className="px-3 py-2.5 border-t-2 border-border/25 bg-card/10 space-y-2">
                            <p className="font-body text-lg text-foreground break-words">{formatSessionDevice(session)}</p>
                            <div className="grid grid-cols-[auto,1fr] gap-x-2 gap-y-1 items-start">
                              <span className="font-display text-[10px] text-muted-foreground">IP</span>
                              <span className="font-body text-base text-muted-foreground break-all">
                                {session.ip ?? "Unknown"}
                              </span>
                              <span className="font-display text-[10px] text-muted-foreground">Actif</span>
                              <span className="font-body text-base text-muted-foreground">
                                {formatSessionDate(session.lastSeenAt)}
                              </span>
                              <span className="font-display text-[10px] text-muted-foreground">Créé</span>
                              <span className="font-body text-base text-muted-foreground">
                                {formatSessionDate(session.createdAt)}
                              </span>
                              <span className="font-display text-[10px] text-muted-foreground">Expire</span>
                              <span className="font-body text-base text-muted-foreground">
                                {formatSessionDate(session.expiresAt)}
                              </span>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ))}
                    {(authSessions.data?.sessions.length ?? 0) === 0 ? (
                      <p className="font-body text-lg text-muted-foreground">Aucune session active.</p>
                    ) : null}
                    <div className="pt-1 flex justify-end">
                      <button
                        type="button"
                        disabled={logoutOtherSessions.isPending}
                        onClick={() => {
                          logoutOtherSessions.mutate(undefined, {
                            onSuccess: (result) => {
                              toast({
                                title: "Autres appareils déconnectés",
                                description: `${result.removedSessions} session(s) fermée(s)`,
                              });
                            },
                          });
                        }}
                        className="pixel-button px-3 py-2 bg-transparent border-primary text-foreground disabled:opacity-50"
                      >
                        {logoutOtherSessions.isPending ? "..." : "Déconnecter les autres appareils"}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="pixel-box p-4 bg-card/30">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-foreground" />
                    <p className="font-display text-xs text-foreground">Changer de mot de passe</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowChangePasswordForm((v) => !v)}
                    className="pixel-button px-3 py-2 bg-transparent border-primary text-foreground"
                  >
                    {showChangePasswordForm ? "Masquer" : "Changer le mdp"}
                  </button>
                </div>
                {showChangePasswordForm ? (
                  <form
                    className="space-y-3 mt-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      setChangePasswordLocalError(null);
                      if (newPassword !== confirmPassword) {
                        setChangePasswordLocalError("Les nouveaux mots de passe ne correspondent pas.");
                        return;
                      }
                      if (newPassword.length < 8) {
                        setChangePasswordLocalError("Le nouveau mot de passe doit faire au moins 8 caractères.");
                        return;
                      }
                      changePassword.mutate(
                        { currentPassword, newPassword },
                        {
                          onSuccess: () => {
                            setCurrentPassword("");
                            setNewPassword("");
                            setConfirmPassword("");
                            setShowChangePasswordForm(false);
                            toast({ title: "Mot de passe mis à jour" });
                          },
                        },
                      );
                    }}
                  >
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="pixel-input w-full px-3 py-3 bg-card/30 text-foreground"
                      placeholder="Mot de passe actuel"
                      autoComplete="current-password"
                      required
                    />
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="pixel-input w-full px-3 py-3 bg-card/30 text-foreground"
                      placeholder="Nouveau mot de passe"
                      autoComplete="new-password"
                      minLength={8}
                      required
                    />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="pixel-input w-full px-3 py-3 bg-card/30 text-foreground"
                      placeholder="Confirmer le nouveau mot de passe"
                      autoComplete="new-password"
                      minLength={8}
                      required
                    />
                    {changePasswordError ? <p className="font-body text-lg text-destructive">{changePasswordError}</p> : null}
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={changePassword.isPending}
                        className="pixel-button px-3 py-2 bg-transparent border-primary text-foreground disabled:opacity-50"
                      >
                        {changePassword.isPending ? "Saving..." : "Save password"}
                      </button>
                    </div>
                  </form>
                ) : null}
              </div>

              <div className="pixel-box p-4 bg-card/30">
                <div className="flex items-center gap-2 justify-between">
                  <div className="flex items-center gap-2">
                    <LogOut className="w-4 h-4 text-foreground" />
                    <p className="font-display text-xs text-foreground">Session</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => logout.mutate(undefined, { onSuccess: onClose })}
                    disabled={logout.isPending}
                    className="pixel-button px-3 py-2 bg-transparent border-primary text-foreground disabled:opacity-50"
                  >
                    {logout.isPending ? "..." : "Logout"}
                  </button>
                </div>
              </div>

              <div className="pixel-box p-4 bg-destructive/10 border-destructive/40">
                <p className="font-display text-xs text-foreground">Danger zone</p>
                <p className="font-body text-lg text-muted-foreground mt-1">
                  Supprime ce compte et toutes ses données (tracker + Pokegame).
                </p>
                <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2">
                  <input
                    type="password"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    className="pixel-input flex-1 h-10 px-3 bg-card/20 text-foreground"
                    placeholder="Mot de passe"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    disabled={!deletePassword.trim()}
                    onClick={() => setShowDeleteForm(true)}
                    className="pixel-button h-10 px-3 py-2 bg-transparent border-destructive text-destructive disabled:opacity-50"
                  >
                    Supprimer mon compte
                  </button>
                </div>
                {!showDeleteForm ? null : (
                  <form
                    className="mt-3 space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (deleteConfirmPhrase.trim().toUpperCase() !== "SUPPRIMER") return;
                      const confirmed = window.confirm(
                        "Dernière confirmation : supprimer définitivement ce compte et toutes ses données ?",
                      );
                      if (!confirmed) return;
                      deleteAccount.mutate(
                        { password: deletePassword, confirmPhrase: deleteConfirmPhrase },
                        {
                          onSuccess: () => {
                            toast({
                              title: "Compte supprimé",
                              description: "Toutes les données de ce compte ont été supprimées.",
                            });
                            onClose();
                          },
                        },
                      );
                    }}
                  >
                    <p className="font-body text-base text-muted-foreground">
                      Confirme la suppression en tapant <span className="text-foreground">SUPPRIMER</span>.
                    </p>
                    <input
                      type="text"
                      value={deleteConfirmPhrase}
                      onChange={(e) => setDeleteConfirmPhrase(e.target.value)}
                      className="pixel-input w-full px-3 py-3 bg-card/30 text-foreground"
                      placeholder='Tapez "SUPPRIMER"'
                      required
                    />
                    {deleteAccountError ? <p className="font-body text-lg text-destructive">{deleteAccountError}</p> : null}
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowDeleteForm(false);
                          setDeleteConfirmPhrase("");
                        }}
                        className="pixel-button px-3 py-2 bg-transparent border-primary text-foreground"
                      >
                        Annuler
                      </button>
                      <button
                        type="submit"
                        disabled={deleteAccount.isPending || !deletePassword.trim()}
                        className="pixel-button px-3 py-2 bg-transparent border-destructive text-destructive disabled:opacity-50"
                      >
                        {deleteAccount.isPending ? "Suppression..." : "Confirmer la suppression"}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="pixel-box p-4 bg-card/30">
                <div className="flex items-center gap-2 mb-2">
                  <Download className="w-4 h-4 text-foreground" />
                  <p className="font-display text-xs text-foreground">Exporter vos données</p>
                </div>
                <p className="font-body text-lg text-muted-foreground">
                  Exporte vos données en JSON (backup réimportable).
                </p>
                <div className="mt-3 flex flex-col items-end gap-2">
                  <button
                    type="button"
                    disabled={exportData.isPending}
                    className="pixel-button px-3 py-2 bg-transparent border-primary text-foreground disabled:opacity-50"
                    onClick={() => {
                      exportData.mutate("tracker-only", {
                        onSuccess: ({ payload, filename }) => {
                          const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
                          const url = URL.createObjectURL(blob);
                          const anchor = document.createElement("a");
                          anchor.href = url;
                          anchor.download = filename;
                          anchor.click();
                          URL.revokeObjectURL(url);
                          toast({ title: "Export tracker prêt", description: filename });
                        },
                      });
                    }}
                  >
                    {exportData.isPending ? "Exporting..." : "Exporter seulement le tracker"}
                  </button>
                  <button
                    type="button"
                    disabled={exportData.isPending}
                    className="pixel-button px-3 py-2 bg-transparent border-primary text-foreground disabled:opacity-50"
                    onClick={() => {
                      exportData.mutate("tracker-and-pokegame", {
                        onSuccess: ({ payload, filename }) => {
                          const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
                          const url = URL.createObjectURL(blob);
                          const anchor = document.createElement("a");
                          anchor.href = url;
                          anchor.download = filename;
                          anchor.click();
                          URL.revokeObjectURL(url);
                          toast({ title: "Export complet prêt", description: filename });
                        },
                      });
                    }}
                  >
                    {exportData.isPending ? "Exporting..." : "Exporter tracker + Pokegame"}
                  </button>
                </div>
              </div>

              <div className="pixel-box p-4 bg-card/30 space-y-3">
                <div className="flex items-center gap-2">
                  <Upload className="w-4 h-4 text-foreground" />
                  <p className="font-display text-xs text-foreground">Importer des données</p>
                </div>
                <p className="font-body text-lg text-muted-foreground">
                  Supporte l’export JSON de cette app et le ZIP CSV de Habitudes / Loop Habit Tracker.
                </p>
                <p className="font-body text-lg text-muted-foreground/90 break-all">{importFileHint}</p>

                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,.zip,application/json,application/zip"
                    className="hidden"
                    onChange={(e) => {
                      resetImportReviewState();
                      setSelectedFile(e.target.files?.[0] ?? null);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="pixel-button px-3 py-2 bg-transparent border-primary text-foreground"
                  >
                    Choisir un fichier
                  </button>
                  <label className="flex items-center gap-2 text-foreground cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={replaceExisting}
                      onChange={(e) => {
                        setReplaceExisting(e.target.checked);
                        resetImportReviewState();
                      }}
                      className="accent-cyan-400"
                    />
                    <span className="font-body text-lg">Remplacer mes habitudes existantes</span>
                  </label>
                </div>

                {importMutationError ? <p className="font-body text-lg text-destructive">{importMutationError}</p> : null}

                {importPreview ? (
                  <div className="space-y-3 border-2 border-border/40 bg-card/10 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-display text-[10px] sm:text-xs text-foreground">Prévisualisation prête</p>
                        <p className="font-body text-base text-muted-foreground">
                          Expire le {new Date(importPreview.expiresAt).toLocaleTimeString()}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="pixel-button px-3 py-2 bg-transparent border-primary text-foreground"
                        onClick={() => {
                          resetImportReviewState();
                        }}
                      >
                        Recommencer
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="border-2 border-border/30 bg-card/10 p-2">
                        <p className="font-display text-[10px] text-muted-foreground">Habits</p>
                        <p className="font-body text-lg text-foreground">{importPreview.summary.habitsImported}</p>
                      </div>
                      <div className="border-2 border-border/30 bg-card/10 p-2">
                        <p className="font-display text-[10px] text-muted-foreground">Checks</p>
                        <p className="font-body text-lg text-foreground">{importPreview.summary.logsImported}</p>
                      </div>
                      <div className="border-2 border-border/30 bg-card/10 p-2">
                        <p className="font-display text-[10px] text-muted-foreground">À revoir</p>
                        <p className="font-body text-lg text-foreground">{importPreview.reviewSummary.totalReviewItems}</p>
                      </div>
                      <div className="border-2 border-border/30 bg-card/10 p-2">
                        <p className="font-display text-[10px] text-muted-foreground">Format</p>
                        <p className="font-body text-base text-foreground break-words">{importPreview.format}</p>
                      </div>
                    </div>

                    {reviewItemsNeedingAttention.length > 0 ? (
                      <div className="space-y-2">
                        <p className="font-display text-[10px] sm:text-xs text-foreground">
                          Review Assistant ({reviewItemsNeedingAttention.length})
                        </p>
                        <div className="max-h-[40vh] overflow-y-auto pr-1 space-y-2">
                          {reviewItemsNeedingAttention.map((item) => {
                            const draft = reviewOverrides[item.sourceKey] ?? {};
                            const currentFrequencyCount = draft.frequencyCount ?? item.frequencyCount;
                            const currentFrequencyPeriod = draft.frequencyPeriod ?? item.frequencyPeriod;
                            const currentQuantUnitPreset = draft.quantUnitPreset ?? item.quantUnitPreset ?? "count";
                            const currentQuantUnitCustom = draft.quantUnitCustom ?? item.quantUnitCustom ?? "";
                            const currentQuantTargetValue = draft.quantTargetValue ?? item.quantTargetValue ?? "";
                            const currentQuantGoalType = draft.quantGoalType ?? item.quantGoalType ?? "at_least";

                            return (
                              <div
                                key={item.sourceKey}
                                className={`border-2 p-3 space-y-2 ${
                                  item.frequencyConfidence === "low"
                                    ? "border-amber-300/40 bg-amber-500/5"
                                    : "border-border/30 bg-card/10"
                                }`}
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div>
                                    <p className="font-display text-[10px] sm:text-xs text-foreground">{item.title}</p>
                                    <p className="font-body text-base text-muted-foreground">
                                      {item.trackingType === "quantifiable" ? "Quantifiable" : "Oui / Non"} • freq{" "}
                                      {item.frequencyConfidence}
                                    </p>
                                  </div>
                                  {item.frequencyReviewReason ? (
                                    <p className="font-body text-base text-amber-200">{item.frequencyReviewReason}</p>
                                  ) : null}
                                </div>

                                <div className="grid grid-cols-[96px_1fr] gap-2 items-center">
                                  <label className="font-display text-[10px] text-muted-foreground">Fréquence</label>
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="number"
                                      min={1}
                                      max={999}
                                      value={currentFrequencyCount}
                                      onChange={(e) => {
                                        const parsed = Number(e.target.value);
                                        if (!Number.isFinite(parsed)) return;
                                        setReviewOverride(item.sourceKey, {
                                          frequencyCount: Math.max(1, Math.min(999, Math.floor(parsed))),
                                        });
                                      }}
                                      className="pixel-input w-20 px-2 py-2 bg-card/20 text-foreground"
                                    />
                                    <select
                                      value={currentFrequencyPeriod}
                                      onChange={(e) =>
                                        setReviewOverride(item.sourceKey, {
                                          frequencyPeriod: e.target.value as ImportReviewOverrideDraft["frequencyPeriod"],
                                        })
                                      }
                                      className="pixel-input flex-1 px-2 py-2 bg-card/20 text-foreground"
                                    >
                                      {FREQUENCY_PERIOD_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                          {option.label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </div>

                                {item.trackingType === "quantifiable" ? (
                                  <>
                                    <div className="grid grid-cols-[96px_1fr] gap-2 items-center">
                                      <label className="font-display text-[10px] text-muted-foreground">Unité</label>
                                      <div className="space-y-2">
                                        <select
                                          value={currentQuantUnitPreset}
                                          onChange={(e) =>
                                            setReviewOverride(item.sourceKey, {
                                              quantUnitPreset: e.target.value as ImportReviewOverrideDraft["quantUnitPreset"],
                                            })
                                          }
                                          className="pixel-input w-full px-2 py-2 bg-card/20 text-foreground"
                                        >
                                          {QUANT_UNIT_OPTIONS.map((option) => (
                                            <option key={option.value} value={option.value}>
                                              {option.label}
                                            </option>
                                          ))}
                                        </select>
                                        {currentQuantUnitPreset === "custom" ? (
                                          <input
                                            value={currentQuantUnitCustom}
                                            onChange={(e) =>
                                              setReviewOverride(item.sourceKey, {
                                                quantUnitCustom: e.target.value,
                                              })
                                            }
                                            className="pixel-input w-full px-2 py-2 bg-card/20 text-foreground"
                                            placeholder="Unité custom"
                                            maxLength={30}
                                          />
                                        ) : null}
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-[96px_1fr] gap-2 items-center">
                                      <label className="font-display text-[10px] text-muted-foreground">Cible</label>
                                      <div className="flex items-center gap-2">
                                        <input
                                          value={currentQuantTargetValue}
                                          onChange={(e) =>
                                            setReviewOverride(item.sourceKey, {
                                              quantTargetValue: e.target.value,
                                            })
                                          }
                                          className="pixel-input flex-1 px-2 py-2 bg-card/20 text-foreground"
                                          placeholder={currentQuantUnitPreset === "time_of_day" ? "HH:mm" : "15"}
                                          maxLength={32}
                                        />
                                        <select
                                          value={currentQuantGoalType}
                                          onChange={(e) =>
                                            setReviewOverride(item.sourceKey, {
                                              quantGoalType: e.target.value as ImportReviewOverrideDraft["quantGoalType"],
                                            })
                                          }
                                          className="pixel-input w-32 px-2 py-2 bg-card/20 text-foreground"
                                        >
                                          {QUANT_GOAL_TYPE_OPTIONS.map((option) => (
                                            <option key={option.value} value={option.value}>
                                              {option.label}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                    </div>

                                    {item.sampleValues.length > 0 ? (
                                      <p className="font-body text-base text-muted-foreground">
                                        Valeurs importées (aperçu):{" "}
                                        <span className="text-foreground">{item.sampleValues.join(", ")}</span>
                                      </p>
                                    ) : null}
                                  </>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <p className="font-body text-lg text-muted-foreground">
                        Aucun ajustement détecté. Vous pouvez confirmer l’import.
                      </p>
                    )}
                  </div>
                ) : null}

                <div className="flex justify-end">
                  {!importPreview ? (
                    <button
                      type="button"
                      disabled={!selectedFile || previewImport.isPending}
                      className="pixel-button px-3 py-2 bg-transparent border-primary text-foreground disabled:opacity-50"
                      onClick={async () => {
                        if (!selectedFile) return;
                        setImportError(null);
                        try {
                          const fileBase64 = await fileToBase64(selectedFile);
                          previewImport.mutate(
                            {
                              fileName: selectedFile.name,
                              fileBase64,
                              replaceExisting,
                            },
                            {
                              onSuccess: (preview) => {
                                setImportPreview(preview);
                                setReviewOverrides({});
                                toast({
                                  title: "Prévisualisation prête",
                                  description: `${preview.reviewSummary.totalReviewItems} élément(s) à vérifier`,
                                });
                              },
                            },
                          );
                        } catch (error) {
                          setImportError(error instanceof Error ? error.message : "Impossible de lire le fichier");
                        }
                      }}
                    >
                      {previewImport.isPending ? "Prévisualisation..." : "Prévisualiser l'import"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={commitImport.isPending}
                      className="pixel-button px-3 py-2 bg-transparent border-primary text-foreground disabled:opacity-50"
                      onClick={() => {
                        if (!importPreview) return;
                        const overrides = Object.entries(reviewOverrides)
                          .map(([sourceKey, draft]) => ({
                            sourceKey,
                            ...draft,
                          }))
                          .filter((override) => {
                            const { sourceKey, ...rest } = override;
                            return Object.values(rest).some((value) => value !== undefined);
                          });

                        commitImport.mutate(
                          {
                            stageToken: importPreview.stageToken,
                            overrides,
                          },
                          {
                            onSuccess: (summary) => {
                              toast({
                                title: "Import terminé",
                                description: `${summary.habitsImported} habits • ${summary.logsImported} checks • ${summary.format}`,
                              });
                              onClose();
                            },
                          },
                        );
                      }}
                    >
                      {commitImport.isPending ? "Import..." : "Confirmer l'import"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
