// Prints how many processes belong to a job folder (by its DAISY_JOB_DIR tag and the process tree): node test/job-procs.mjs <jobDir>
import { findProcs } from "../worker/kill.mjs";
console.log(findProcs({ jobDir: process.argv[2] }).length);
