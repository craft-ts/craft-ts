import { craftExpose, craftService } from '@craft-ts/core';
import { newUuid } from './replay-browser';
import { launchGuidedResumeTab, replayPoint } from './replay-debug';
import {
  resumeDialogOpen,
  resumeIntent,
  routeSessionId,
  sidePanelOpen,
  sideTab,
} from './replay-state';
import { copyResumePrompt, resumePrompt } from './resume-prompt';
import { ResumeThread } from './resume-thread.service';
import { SessionArchive } from './session-archive.service';

/**
 * « Reprendre ici », once the person said what it is for: the app tab opens
 * first (still inside the click, or the browser blocks it), the prompt goes to
 * the clipboard, the archive records the request, and the panel turns to the
 * « Reprises » view where the agent's progress shows.
 */
export const { ResumeRequest } = craftService(
  { name: 'resumeRequest', providedIn: 'global' },
  function* () {
    const archive = yield* SessionArchive();
    const resumeThread = yield* ResumeThread();
    yield* craftExpose('submit', function* () {
      const sessionId = routeSessionId();
      const intent = resumeIntent().trim();
      if (sessionId === undefined || !intent) return;
      const point = replayPoint();
      const requestId = newUuid();
      const appTab = launchGuidedResumeTab(
        point.beforeSequence,
        point.participantId,
        requestId,
        sessionId,
      );
      const prompt = resumePrompt({
        sessionId,
        beforeSequence: point.beforeSequence,
        participantId: point.participantId,
        requestId,
        appUrl: appTab.url,
        intent,
      });
      copyResumePrompt(prompt);
      const sent = yield* archive.requestResume(
        { sessionId, ...point },
        requestId,
        prompt,
        appTab.url,
        appTab.opened,
      );
      if (!sent) {
        appTab.tab?.close();
        return;
      }
      resumeThread.watchRequest(requestId);
      resumeIntent.set('');
      resumeDialogOpen.set(false);
      sideTab.set('resumes');
      sidePanelOpen.set(true);
    });
  },
);
