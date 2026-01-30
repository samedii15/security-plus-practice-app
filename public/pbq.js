// PBQ Frontend Handling
// Renders and manages PBQ (Performance-Based Question) interactions

/**
 * Render a PBQ question based on its type
 * @param {Object} pbqData - PBQ configuration object
 * @param {*} userAnswer - Current user answer (if any)
 * @param {Function} onAnswerChange - Callback when answer changes
 * @returns {string} HTML string
 */
export function renderPBQ(pbqData, userAnswer, onAnswerChange) {
  if (!pbqData || !pbqData.type) {
    return '<p class="error">Invalid PBQ data</p>';
  }

  switch (pbqData.type) {
    case 'multi_select':
      return renderMultiSelect(pbqData, userAnswer, onAnswerChange);
    case 'ordering':
      return renderOrdering(pbqData, userAnswer, onAnswerChange);
    case 'matching':
      return renderMatching(pbqData, userAnswer, onAnswerChange);
    default:
      return `<p class="error">Unknown PBQ type: ${pbqData.type}</p>`;
  }
}

/**
 * Render multi-select PBQ
 */
function renderMultiSelect(pbqData, userAnswer, onAnswerChange) {
  const selected = userAnswer?.selected || [];
  
  let html = `<div class="pbq-container pbq-multi-select">`;
  html += `<p class="pbq-prompt">${pbqData.prompt}</p>`;
  html += `<div class="pbq-options">`;
  
  pbqData.options.forEach((option, index) => {
    const isChecked = selected.includes(index);
    html += `
      <div class="pbq-option">
        <label>
          <input type="checkbox" 
                 value="${index}" 
                 ${isChecked ? 'checked' : ''}
                 onchange="handlePBQMultiSelectChange(${index})">
          <span>${option}</span>
        </label>
      </div>
    `;
  });
  
  html += `</div></div>`;
  return html;
}

/**
 * Render ordering PBQ
 */
function renderOrdering(pbqData, userAnswer, onAnswerChange) {
  const items = pbqData.items || pbqData.options || [];
  const order = userAnswer?.order || items.map((_, i) => i);
  
  let html = `<div class="pbq-container pbq-ordering">`;
  html += `<p class="pbq-prompt">${pbqData.prompt}</p>`;
  html += `<p class="pbq-instruction">Drag items to reorder them (top = first)</p>`;
  html += `<div class="pbq-ordering-list" id="pbq-ordering-list">`;
  
  order.forEach((itemIndex, position) => {
    html += `
      <div class="pbq-ordering-item" data-index="${itemIndex}" draggable="true">
        <span class="drag-handle">☰</span>
        <span class="item-number">${position + 1}.</span>
        <span class="item-text">${items[itemIndex]}</span>
      </div>
    `;
  });
  
  html += `</div></div>`;
  return html;
}

/**
 * Render matching PBQ
 */
function renderMatching(pbqData, userAnswer, onAnswerChange) {
  const left = pbqData.left || [];
  const right = pbqData.right || [];
  const map = userAnswer?.map || {};
  
  let html = `<div class="pbq-container pbq-matching">`;
  html += `<p class="pbq-prompt">${pbqData.prompt}</p>`;
  html += `<div class="pbq-matching-grid">`;
  html += `<div class="pbq-matching-left">`;
  
  left.forEach((item, index) => {
    html += `
      <div class="pbq-matching-item">
        <strong>${index + 1}.</strong> ${item}
      </div>
    `;
  });
  
  html += `</div><div class="pbq-matching-middle">`;
  
  left.forEach((item, index) => {
    const selectedRight = map[index] !== undefined ? map[index] : '';
    html += `
      <select class="pbq-matching-select" data-left="${index}" onchange="handlePBQMatchingChange(${index}, this.value)">
        <option value="">-- Select --</option>
        ${right.map((rightItem, rightIndex) => `
          <option value="${rightIndex}" ${selectedRight == rightIndex ? 'selected' : ''}>
            ${String.fromCharCode(65 + rightIndex)}
          </option>
        `).join('')}
      </select>
    `;
  });
  
  html += `</div><div class="pbq-matching-right">`;
  
  right.forEach((item, index) => {
    html += `
      <div class="pbq-matching-item">
        <strong>${String.fromCharCode(65 + index)}.</strong> ${item}
      </div>
    `;
  });
  
  html += `</div></div></div>`;
  return html;
}

/**
 * Render PBQ review (read-only comparison)
 */
export function renderPBQReview(pbqData, userAnswer, isCorrect) {
  if (!pbqData) return '';
  
  let correctData = null;
  try {
    correctData = typeof pbqData === 'string' ? JSON.parse(pbqData) : pbqData;
  } catch (e) {
    return '<p class="error">Unable to parse correct answer</p>';
  }
  
  let html = `<div class="pbq-review ${isCorrect ? 'correct' : 'incorrect'}">`;
  
  switch (correctData.type) {
    case 'multi_select':
      html += renderMultiSelectReview(correctData, userAnswer, isCorrect);
      break;
    case 'ordering':
      html += renderOrderingReview(correctData, userAnswer, isCorrect);
      break;
    case 'matching':
      html += renderMatchingReview(correctData, userAnswer, isCorrect);
      break;
  }
  
  html += `</div>`;
  return html;
}

function renderMultiSelectReview(correctData, userAnswer, isCorrect) {
  const userSelected = userAnswer?.selected || [];
  const correctIndices = correctData.correct || [];
  const options = correctData.options || [];
  
  let html = `<div class="pbq-review-multi-select">`;
  html += `<p><strong>Your selections:</strong></p><ul>`;
  
  if (userSelected.length === 0) {
    html += `<li class="not-answered">No selections made</li>`;
  } else {
    userSelected.forEach(idx => {
      const isCorrectChoice = correctIndices.includes(idx);
      html += `<li class="${isCorrectChoice ? 'correct-choice' : 'wrong-choice'}">${options[idx]}</li>`;
    });
  }
  
  html += `</ul><p><strong>Correct answer:</strong></p><ul>`;
  correctIndices.forEach(idx => {
    html += `<li class="correct-choice">${options[idx]}</li>`;
  });
  html += `</ul></div>`;
  
  return html;
}

function renderOrderingReview(correctData, userAnswer, isCorrect) {
  const userOrder = userAnswer?.order || [];
  const correctOrder = correctData.correct_order || [];
  const items = correctData.items || correctData.options || [];
  
  let html = `<div class="pbq-review-ordering">`;
  html += `<div class="order-comparison">`;
  html += `<div class="user-order"><strong>Your order:</strong><ol>`;
  
  if (userOrder.length === 0) {
    html += `<li class="not-answered">Not answered</li>`;
  } else {
    userOrder.forEach((idx, pos) => {
      const isCorrectPos = correctOrder[pos] === idx;
      html += `<li class="${isCorrectPos ? 'correct-pos' : 'wrong-pos'}">${items[idx]}</li>`;
    });
  }
  
  html += `</ol></div><div class="correct-order"><strong>Correct order:</strong><ol>`;
  correctOrder.forEach(idx => {
    html += `<li>${items[idx]}</li>`;
  });
  html += `</ol></div></div></div>`;
  
  return html;
}

function renderMatchingReview(correctData, userAnswer, isCorrect) {
  const userMap = userAnswer?.map || {};
  const correctMap = correctData.correct_map || {};
  const left = correctData.left || [];
  const right = correctData.right || [];
  
  let html = `<div class="pbq-review-matching"><table class="matching-table">`;
  html += `<thead><tr><th>Item</th><th>Your Match</th><th>Correct Match</th></tr></thead><tbody>`;
  
  left.forEach((leftItem, leftIdx) => {
    const userRightIdx = userMap[leftIdx];
    const correctRightIdx = correctMap[leftIdx];
    const isCorrectMatch = userRightIdx == correctRightIdx;
    
    html += `<tr class="${isCorrectMatch ? 'correct-row' : 'wrong-row'}">`;
    html += `<td><strong>${leftIdx + 1}.</strong> ${leftItem}</td>`;
    html += `<td>${userRightIdx !== undefined ? `<strong>${String.fromCharCode(65 + userRightIdx)}.</strong> ${right[userRightIdx]}` : '<em>Not answered</em>'}</td>`;
    html += `<td><strong>${String.fromCharCode(65 + correctRightIdx)}.</strong> ${right[correctRightIdx]}</td>`;
    html += `</tr>`;
  });
  
  html += `</tbody></table></div>`;
  return html;
}

// Global handlers for PBQ interactions
window.handlePBQMultiSelectChange = function(index) {
  const currentAnswer = window.state.answers[window.state.currentQuestionIndex + 1] || { type: 'multi_select', selected: [] };
  const selected = currentAnswer.selected || [];
  
  const indexPos = selected.indexOf(index);
  if (indexPos > -1) {
    selected.splice(indexPos, 1);
  } else {
    selected.push(index);
  }
  
  window.state.answers[window.state.currentQuestionIndex + 1] = {
    type: 'multi_select',
    selected: selected
  };
  
  // Update grid to show answered
  if (window.updateQuestionGrid) {
    window.updateQuestionGrid();
  }
};

window.handlePBQMatchingChange = function(leftIndex, rightIndex) {
  const questionNum = window.state.currentQuestionIndex + 1;
  const currentAnswer = window.state.answers[questionNum] || { type: 'matching', map: {} };
  
  if (rightIndex === '') {
    delete currentAnswer.map[leftIndex];
  } else {
    currentAnswer.map[leftIndex] = parseInt(rightIndex);
  }
  
  window.state.answers[questionNum] = currentAnswer;
  
  if (window.updateQuestionGrid) {
    window.updateQuestionGrid();
  }
};

// Initialize drag-and-drop for ordering PBQs
export function initPBQOrdering() {
  const list = document.getElementById('pbq-ordering-list');
  if (!list) return;
  
  let draggedItem = null;
  
  list.addEventListener('dragstart', (e) => {
    if (e.target.classList.contains('pbq-ordering-item')) {
      draggedItem = e.target;
      e.target.style.opacity = '0.5';
    }
  });
  
  list.addEventListener('dragend', (e) => {
    if (e.target.classList.contains('pbq-ordering-item')) {
      e.target.style.opacity = '1';
    }
  });
  
  list.addEventListener('dragover', (e) => {
    e.preventDefault();
    const afterElement = getDragAfterElement(list, e.clientY);
    if (afterElement == null) {
      list.appendChild(draggedItem);
    } else {
      list.insertBefore(draggedItem, afterElement);
    }
  });
  
  list.addEventListener('drop', (e) => {
    e.preventDefault();
    updateOrderingAnswer();
  });
  
  function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.pbq-ordering-item:not(.dragging)')];
    
    return draggableElements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      
      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }
  
  function updateOrderingAnswer() {
    const items = list.querySelectorAll('.pbq-ordering-item');
    const order = Array.from(items).map(item => parseInt(item.dataset.index));
    
    window.state.answers[window.state.currentQuestionIndex + 1] = {
      type: 'ordering',
      order: order
    };
    
    if (window.updateQuestionGrid) {
      window.updateQuestionGrid();
    }
  }
}
