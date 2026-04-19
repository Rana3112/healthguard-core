import React from "react";
import { ShieldCheck } from "lucide-react";
import { requestAllPermissions } from "../src/lib/permissions";

interface PermissionPromptProps {
  onDone: () => void;
}

const PermissionPrompt: React.FC<PermissionPromptProps> = ({ onDone }) => {
  const handleContinue = async () => {
    try {
      await requestAllPermissions();
    } finally {
      onDone();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-xl bg-teal-100 p-3 text-teal-600">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Permissions</h2>
            <p className="text-sm text-slate-500">
              HealthGuard may request microphone and related permissions for app features.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <button
            onClick={onDone}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600"
          >
            Skip
          </button>
          <button
            onClick={() => void handleContinue()}
            className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-medium text-white"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
};

export default PermissionPrompt;
