// Shell commands and desktop control ("power lanes"): on by default (powerLanes: true in worker/config.json, written by the
// installer unless --no-power-lanes). Off or missing means refused. The connector hides and refuses these tools as well;
// this is the {{MACHINE}}'s own check, so a job or command that reaches the worker anyway is still refused.
//
// Usage: import { powerRefusal } from "./power.mjs"

export const POWER_OFF = "This install has the command line and desktop control turned off. To turn them on, rerun the installer with --power-lanes, or run it again and answer yes.";
export const POWER_MODES = ["screen", "computer"]; // look_at_screen and use_computer jobs
export const POWER_CONTROLS = ["shell"];          // run_command, through the supervisor

export const powerOn = (cfg) => cfg?.powerLanes === true;

// Why this job (by its mode) or control command (by its kind) may not run here, or null when it may.
export function powerRefusal(cfg, { mode, kind } = {}) {
  if (powerOn(cfg)) return null;
  return POWER_MODES.includes(mode) || POWER_CONTROLS.includes(kind) ? POWER_OFF : null;
}
