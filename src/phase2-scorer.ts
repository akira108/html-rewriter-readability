import {
  CHAR_THRESHOLD,
  COMMAS_REGEX,
  DEFAULT_TAGS_TO_SCORE,
  NB_TOP_CANDIDATES

} from './constants';
import type { ElementInfo } from './types';
import {
  getAncestorIds,
  getChildrenIds,
  getClassWeight,
  getDescendantIds,
  getElementInfo,
  getInnerText,
  getLinkDensity,
  getParentId,
  isUnlikelyCandidate
} from './utils';

interface ScoringOptions {
  debug: boolean;
  nbTopCandidates?: number; // default 5
  charThreshold?: number; // default 500
  allowedVideoRegex?: RegExp;
  linkDensityModifier?: number; // default 0
}

function initializeNodeScore(id: number, store: Map<number, ElementInfo>): ElementInfo | undefined {
  const info = getElementInfo(id, store);
  if (!info || info.readability) return undefined;
  info.readability = { contentScore: 0 };
  switch (info.tagName) {
    case "ARTICLE": case "DIV": info.readability.contentScore += 5; break;
    case "PRE": case "TD": case "BLOCKQUOTE": info.readability.contentScore += 3; break;
    case "ADDRESS": /*...*/ info.readability.contentScore -= 3; break;
    case "H1": /*...*/ info.readability.contentScore -= 5; break;
  }
  info.readability.contentScore += getClassWeight(id, store);
  return info
}

// --- Main Function ---
export function calculateScoresAndFindBestCandidate(
  elementStore: Map<number, ElementInfo>,
  options: ScoringOptions
): { topCandidateId: number | null, elementsToKeepIds: number[] } {
  const { debug, nbTopCandidates = NB_TOP_CANDIDATES, charThreshold = CHAR_THRESHOLD, allowedVideoRegex, linkDensityModifier = 0 } = options;

  if (debug) console.log("Starting Phase 2: Scoring...");
  if (debug) console.log("Using options:", { nbTopCandidates, charThreshold, linkDensityModifier });

  const candidates = new Map<number, ElementInfo>();
  const elementsToScoreIds: number[] = [];

  // 1. Identify elements to score
  for (const id of elementStore.keys()) {
    const info = getElementInfo(id, elementStore);
    if (!info || !info.isVisibleBasedOnAttrs || isUnlikelyCandidate(id, elementStore)) continue;
    if (DEFAULT_TAGS_TO_SCORE.has(info.tagName)) {
      elementsToScoreIds.push(id);
    }
  }
  if (debug) console.log(`Found ${elementsToScoreIds.length} elements to score.`);

  // 2. Score elements and propagate to ancestors
  for (const elementId of elementsToScoreIds) {
    const elementInfo = getElementInfo(elementId, elementStore);
    if (!elementInfo || !elementInfo.isVisibleBasedOnAttrs) continue;
    const innerText = getInnerText(elementId, elementStore);
    if (innerText.length < 25) continue;
    const ancestorIds = getAncestorIds(elementId, elementStore, 5);
    if (ancestorIds.length === 0) continue;

    const contentScore = 1 + innerText.split(COMMAS_REGEX).length + Math.min(Math.floor(innerText.length / 100), 3);

    ancestorIds.forEach((ancestorId: number, level: number) => {
      let ancestorInfo = getElementInfo(ancestorId, elementStore);
      if (!ancestorInfo || !ancestorInfo.isVisibleBasedOnAttrs || isUnlikelyCandidate(ancestorId, elementStore)) return;

      if (!ancestorInfo.readability) {
        ancestorInfo = initializeNodeScore(ancestorId, elementStore);
        if (ancestorInfo && (ancestorInfo.readability?.contentScore ?? -1) >= 0) {
          candidates.set(ancestorId, ancestorInfo);
        }
      }

      const scoreDivider = level === 0 ? 1 : (level === 1 ? 2 : level * 3);
      if (ancestorInfo?.readability) {
        ancestorInfo.readability.contentScore += contentScore / scoreDivider;
      }
    });
  }
  if (debug) console.log(`Found ${candidates.size} potential candidates.`);

  // 3. Adjust candidate scores
  const candidateScores = new Map<number, number>();
  for (const [id, candidateInfo] of candidates.entries()) {
    if (candidateInfo.readability) {
      const linkDensity = getLinkDensity(id, elementStore);
      const finalScore = candidateInfo.readability.contentScore * (1 - linkDensity);
      candidateInfo.readability.contentScore = finalScore; // Update
      candidateScores.set(id, finalScore);
    }
  }

  // 4. Select top candidate
  const sortedCandidates = Array.from(candidateScores.entries()).filter(([, score]) => score > 0).sort((a, b) => b[1] - a[1]);
  if (sortedCandidates.length === 0) { /* ... Error handling ... */ return { topCandidateId: null, elementsToKeepIds: [] }; }
  let topCandidateId: number | null = sortedCandidates[0][0];
  let topCandidateScore = sortedCandidates[0][1];
  if (debug) console.log(`Initial Top Candidate: ${getElementInfo(topCandidateId, elementStore)?.tagName}#${topCandidateId} (Score: ${topCandidateScore.toFixed(2)})`);

  // 5. Candidate improvement logic (traverse up to parent)
  let currentCandidateId = topCandidateId;
  let currentScore = topCandidateScore;
  let parentId = getParentId(currentCandidateId, elementStore);
  while (parentId) {
    const parentInfo = getElementInfo(parentId, elementStore);
    const parentScore = parentInfo?.readability?.contentScore ?? -1;
    if (parentScore < currentScore / 3) break;
    if (parentScore > currentScore) {
      currentCandidateId = parentId;
      currentScore = parentScore;
      parentId = getParentId(currentCandidateId, elementStore);
    } else { break; }
  }
  topCandidateId = currentCandidateId;
  topCandidateScore = currentScore;
  // (Similarly implement single child element logic)
  parentId = getParentId(topCandidateId, elementStore);
  let topCandidateInfo = getElementInfo(topCandidateId, elementStore);
  while (parentId && topCandidateInfo && topCandidateInfo.tagName !== 'BODY') {
    const parentChildren = getChildrenIds(parentId, elementStore);
    if (parentChildren.length === 1) {
      topCandidateId = parentId;
      topCandidateInfo = getElementInfo(topCandidateId, elementStore);
      parentId = getParentId(topCandidateId, elementStore);
    } else { break; }
  }


  // 6. Combine sibling elements
  const elementsToKeepIdsSet = new Set<number>();
  const finalTopCandidateParentId = getParentId(topCandidateId, elementStore);
  if (finalTopCandidateParentId && topCandidateId) {
    const siblings = getChildrenIds(finalTopCandidateParentId, elementStore);
    const siblingScoreThreshold = Math.max(10, topCandidateScore * 0.2);
    for (const siblingId of siblings) {
      const siblingInfo = getElementInfo(siblingId, elementStore);
      if (!siblingInfo || !siblingInfo.isVisibleBasedOnAttrs) continue;
      let append = false;
      if (siblingId === topCandidateId) append = true;
      else {
        const siblingScore = siblingInfo.readability?.contentScore ?? 0;
        const contentBonus = 0; /* ... */
        if (siblingScore + contentBonus >= siblingScoreThreshold) append = true;
        else if (siblingInfo.tagName === 'P') { /* ... P tag evaluation ... */ }
      }
      if (append) {
        elementsToKeepIdsSet.add(siblingId);
        for (const id of getDescendantIds(siblingId, elementStore)) {
          elementsToKeepIdsSet.add(id);
        }
      }
    }
  } else if (topCandidateId) {
    elementsToKeepIdsSet.add(topCandidateId);
    for (const id of getDescendantIds(topCandidateId, elementStore)) {
      elementsToKeepIdsSet.add(id);
    }
  }
  const elementsToKeepIds = Array.from(elementsToKeepIdsSet);

  // 7. Check character count
  let totalTextLength = 0;
  for (const id of elementsToKeepIds) {
    const info = getElementInfo(id, elementStore);
    if (info?.isVisibleBasedOnAttrs) totalTextLength += getInnerText(id, elementStore).length;
  }
  if (debug) console.log(`Final combined text length (estimated): ${totalTextLength}`);
  if (totalTextLength < charThreshold) {
    if (debug) console.log(`Content length ${totalTextLength} is below charThreshold ${charThreshold}. Returning null.`);
    return { topCandidateId: null, elementsToKeepIds: [] };
  }

  // 8. Return results
  if (debug) console.log(`Phase 2 Completed. Final Top Candidate: ${getElementInfo(topCandidateId, elementStore)?.tagName}#${topCandidateId}. Elements to keep: ${elementsToKeepIds.length}`);
  return { topCandidateId, elementsToKeepIds };
}
