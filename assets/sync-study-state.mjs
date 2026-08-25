import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.dirname(scriptDirectory);
const sourcePath = path.join(projectDirectory, "02_复盘总结/学习状态/study-project.json");
const targetPath = path.join(scriptDirectory, "study-state.snapshot.js");

const source = JSON.parse(await readFile(sourcePath, "utf8"));

if (source.formal_state?.session_id !== source.active_session_id || source.active_session_id !== source.active_session) {
  throw new Error("active session aliases do not match formal_state.session_id");
}

const activeTrack = source.tracks?.[source.formal_state?.track_id];
const activeDay = activeTrack?.days?.find((day) => day.id === source.formal_state?.day_id);
if (!activeTrack || !activeDay || activeTrack.current_day_id !== activeDay.id) {
  throw new Error("active track/day does not match formal_state");
}
if (Array.isArray(activeTrack.requires_completed_tracks)) {
  for (const prerequisiteTrackId of activeTrack.requires_completed_tracks) {
    const prerequisiteTrack = source.tracks?.[prerequisiteTrackId];
    if (!prerequisiteTrack || prerequisiteTrack.status !== "completed") {
      throw new Error(`active track prerequisite is not completed: ${prerequisiteTrackId}`);
    }
    const incompleteDay = prerequisiteTrack.days?.find((day) => day.formal_status !== "completed");
    if (incompleteDay) {
      throw new Error(`active track prerequisite has incomplete day: ${prerequisiteTrackId}/${incompleteDay.id}`);
    }
  }
}
if (Array.isArray(activeDay.requires_completed_days)) {
  for (const prerequisiteId of activeDay.requires_completed_days) {
    const prerequisite = activeTrack.days.find((day) => day.id === prerequisiteId);
    if (!prerequisite || prerequisite.formal_status !== "completed") {
      throw new Error(`active day course prerequisite is not completed: ${prerequisiteId}`);
    }
  }
}
if (Array.isArray(activeDay.requires_mastered_days)) {
  for (const prerequisiteId of activeDay.requires_mastered_days) {
    const prerequisite = activeTrack.days.find((day) => day.id === prerequisiteId);
    if (!prerequisite || prerequisite.concept_status !== "mastered") {
      throw new Error(`active day mastery prerequisite is not satisfied: ${prerequisiteId}`);
    }
  }
}
const allowedFormalStatuses = new Set(["not_started", "in_progress", "completed"]);
const allowedConceptStatuses = new Set(["untested", "practicing", "needs_reinforcement", "mastered"]);
if (!allowedFormalStatuses.has(activeDay.formal_status)) throw new Error("unknown active day formal_status");
if (!allowedConceptStatuses.has(activeDay.concept_status)) throw new Error("unknown active day concept_status");
const pendingQuestionId = source.formal_state.pending_question_id ?? null;
const requiredRetestId = source.formal_state.required_retest_of_question_id ?? null;
if (pendingQuestionId && requiredRetestId) {
  throw new Error("pending_question_id and required_retest_of_question_id cannot coexist");
}
if ((source.formal_state.current_question?.id ?? null) !== pendingQuestionId) {
  throw new Error("current_question.id does not match pending_question_id");
}
if (source.formal_state.session_id == null) {
  if (source.formal_state.session_state != null || pendingQuestionId || requiredRetestId || source.formal_state.source_record != null) {
    throw new Error("a day without an assessment session cannot have session/question state");
  }
} else {
  if (activeDay.session_id !== source.formal_state.session_id) {
    throw new Error("active assessment session does not match the active day");
  }
  if (activeDay.pending_question_id !== pendingQuestionId || activeDay.pending_question_ordinal !== source.formal_state.pending_question_ordinal) {
    throw new Error("active day pending question does not match formal_state");
  }
  if (source.formal_state.session_state === "completed") {
    throw new Error("a completed session cannot remain the active session");
  }
}
if (activeDay.formal_status === "not_started" && source.formal_state.course_state === "in_progress") {
  throw new Error("formal course state conflicts with active day formal_status");
}
if (activeDay.page_learning?.status === "completed" && activeDay.concept_status === "mastered") {
  const verifiedLayers = activeDay.mastery?.layers?.filter((layer) => ["explain", "apply", "transfer"].includes(layer.id) && layer.status === "verified") ?? [];
  if (verifiedLayers.length < 3) throw new Error("page completion cannot stand in for formal mastery evidence");
}

const banner = `/* GENERATED FILE. Source: 02_复盘总结/学习状态/study-project.json\n * Regenerate with: node assets/sync-study-state.mjs\n * Do not edit formal learning state in this file.\n */\n`;
await writeFile(targetPath, `${banner}window.__STUDY_PROJECT_SNAPSHOT__ = ${JSON.stringify(source, null, 2)};\n`, "utf8");
console.log(`Synced ${path.relative(projectDirectory, targetPath)} from the formal state source.`);
