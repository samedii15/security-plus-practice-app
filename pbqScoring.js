// PBQ Scoring Module
// Handles scoring for different PBQ types: multi_select, ordering, matching

/**
 * Score a multi-select PBQ
 * @param {Array} userSelected - Array of selected indices
 * @param {Array} correctIndices - Array of correct indices
 * @returns {boolean} - True if correct
 */
export function scoreMultiSelect(userSelected, correctIndices) {
  if (!Array.isArray(userSelected) || !Array.isArray(correctIndices)) {
    return false;
  }
  
  // Convert to sets for order-independent comparison
  const userSet = new Set(userSelected);
  const correctSet = new Set(correctIndices);
  
  if (userSet.size !== correctSet.size) {
    return false;
  }
  
  for (const item of userSet) {
    if (!correctSet.has(item)) {
      return false;
    }
  }
  
  return true;
}

/**
 * Score an ordering PBQ
 * @param {Array} userOrder - Array of ordered items
 * @param {Array} correctOrder - Array of correct ordered items
 * @returns {boolean} - True if correct
 */
export function scoreOrdering(userOrder, correctOrder) {
  if (!Array.isArray(userOrder) || !Array.isArray(correctOrder)) {
    return false;
  }
  
  if (userOrder.length !== correctOrder.length) {
    return false;
  }
  
  for (let i = 0; i < userOrder.length; i++) {
    if (userOrder[i] !== correctOrder[i]) {
      return false;
    }
  }
  
  return true;
}

/**
 * Score a matching PBQ
 * @param {Object} userMap - Object mapping keys to values
 * @param {Object} correctMap - Object with correct mappings
 * @returns {boolean} - True if correct
 */
export function scoreMatching(userMap, correctMap) {
  if (!userMap || typeof userMap !== 'object' || !correctMap || typeof correctMap !== 'object') {
    return false;
  }
  
  const userKeys = Object.keys(userMap);
  const correctKeys = Object.keys(correctMap);
  
  if (userKeys.length !== correctKeys.length) {
    return false;
  }
  
  for (const key of correctKeys) {
    if (userMap[key] !== correctMap[key]) {
      return false;
    }
  }
  
  return true;
}

/**
 * Score any PBQ based on its type
 * @param {Object} userAnswer - User's answer object with type
 * @param {Object} correctAnswer - Correct answer object with type
 * @returns {boolean} - True if correct
 */
export function scorePBQ(userAnswer, correctAnswer) {
  if (!userAnswer || !correctAnswer) {
    return false;
  }
  
  const type = userAnswer.type || correctAnswer.type;
  
  switch (type) {
    case 'multi_select':
      return scoreMultiSelect(userAnswer.selected, correctAnswer.correct);
      
    case 'ordering':
      return scoreOrdering(userAnswer.order, correctAnswer.correct_order);
      
    case 'matching':
      return scoreMatching(userAnswer.map, correctAnswer.correct_map);
      
    default:
      console.warn(`Unknown PBQ type: ${type}`);
      return false;
  }
}
