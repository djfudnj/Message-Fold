// Message Fold (Persistent) + Long Press Menu
// 메시지 객체의 extra.folded 값(true/없음)으로 접힘 상태를 저장합니다.
// is_system 처럼 chat.jsonl 에 함께 저장되므로 기기/브라우저가 달라도 유지됩니다.
//
// 동작:
//  - 접힌(저장된) 메시지의 바를 누르면 "임시로" 펼쳐집니다. (저장 상태는 변하지 않음)
//  - 펼쳐진 메시지 안을 누르면 그대로 유지, 다른 메시지/빈 곳을 누르면 다시 접힙니다.
//  - 저장된 접힘 상태는 메시지 액션의 아이콘(접기 설정 ↔ 접기 해제)으로 바뀝니다.
//  - 메시지(접힌 바 포함)를 길게 누르면 팝업이 뜨고 Hide(Unhide) / Delete / Fold(Unfold) / Cancel 을 고를 수 있습니다.
//  - 글자를 드래그로 선택한 뒤 (드래그 끝에서 또는 선택 영역 위에서) 길게 누르면
//    Edit selection / Delete selection 팝업이 뜹니다. (모바일: 선택 후 뜨는 복사/모두 선택 툴바 상태에서 선택된 글자를 더 길게 누르기)

import { chat, eventSource, event_types, saveChatConditional, updateMessageBlock } from '../../../../script.js';

const KEY = 'folded';

// 상태에 따라 번갈아 나오는 아이콘 (message hide/unhide 처럼 같은 자리에서 교체)
const ICON_SET = 'fa-compress';   // 아직 접기 설정이 안 된 상태 → 누르면 접기 설정
const ICON_UNSET = 'fa-expand';   // 접기 설정된 상태 → 누르면 접기 해제
const TITLE_SET = 'Fold message';
const TITLE_UNSET = 'Unfold message';

// ===== 길게 누르기 설정 =====
const HOLD_MS_MOUSE = 610;  // 마우스 길게 누르기 시간
const HOLD_MS_TOUCH = 750;  // 터치(모바일) 길게 누르기 시간
const HOLD_MS_TOUCH_SEL = 600; // 터치: 이미 선택된 글자 위에서 길게 누르는 시간 (선택 메뉴용)
const VISUAL_MS = 300;      // 팝업 직전 이 시간 동안 테두리가 서서히 진해짐
const AFTER_POPUP_MS = 80; // 팝업이 뜬 뒤에도 테두리를 유지하는 시간
const MOVE_TOLERANCE = 10;  // px
const LP_IGNORE = 'a, button, input, textarea, select, .mes_buttons, .mes_edit_buttons, .swipe_left, .swipe_right, .swipes-counter, .extraMesButtons, .mes_img_container, .mes_reasoning_details, [contenteditable="true"], .mes_text img, .mes_text video, .mes_text audio, .mes_text canvas';

// true: 터치 기기에서 본문(.mes_text)을 길게 누르면 팝업 대신 텍스트 선택이 동작
//       (이름/아바타/여백/접힌 바 에서만 길게 누르기 작동)
// false: 본문 포함 어디서든 길게 누르기 작동 (단, 선택이 시작되면 취소)
const TOUCH_TEXT_SELECTABLE = true;

// 글자 주변으로 이 값(px)만큼은 "글자 위"로 간주 (그 밖의 본문 여백은 길게 누르기 허용)
const TEXT_HIT_PAD = 6;

// 바깥 클릭으로 간주하지 않을 영역 (상단바, 하단 입력창, 팝업 등)
const IGNORE_SELECTOR = [
    '#top-bar',
    '#form_sheld',
    '.drawer-content',
    '.popup',
    'dialog',
    '#toast-container',
    '.select2-container',
    '.select2-dropdown',
].join(', ');

// 현재 임시로 펼쳐져 있는 메시지 id (없으면 null)
let openId = null;

const isFolded = (id) => !!chat[id]?.extra?.[KEY];

// 테마가 덮어써도 바가 항상 보이도록 인라인 !important 로 지정
function setImportant(el, styles) {
    for (const [prop, val] of Object.entries(styles)) {
        el.style.setProperty(prop, val, 'important');
    }
}

function clearImportant(el, props) {
    props.forEach((p) => el.style.removeProperty(p));
}

const FIX_PROPS = ['height', 'min-height', 'max-height', 'overflow'];

function styleBar(ph, collapsed, block) {
    if (!collapsed) {
        setImportant(ph, { display: 'none' });
        return;
    }
    // .mes_block 의 좌우 padding 만큼 바깥으로 확장해서 블록 전체 폭에 맞춤
    let pl = 0;
    let pr = 0;
    if (block) {
        const cs = getComputedStyle(block);
        pl = parseFloat(cs.paddingLeft) || 0;
        pr = parseFloat(cs.paddingRight) || 0;
    }
    // .mes_block 의 폭을 그대로 따라가며, 테마 색상 변수로 배경/테두리를 입힘
    setImportant(ph, {
        display: 'flex',
        'align-items': 'center',
        gap: '8px',
        width: `calc(100% + ${pl + pr}px)`,
        'min-height': 'var(--mf-min-height, 34px)',
        'box-sizing': 'border-box',
        padding: '6px 10px',
        'margin-left': `${-pl}px`,
        'margin-right': `${-pr}px`,
        'margin-top': '0',
        'margin-bottom': '0',
        position: 'relative',
        visibility: 'visible',
        opacity: '1',
        overflow: 'hidden',
        cursor: 'pointer',
        color: 'var(--SmartThemeBodyColor, #ddd)',
        background: 'var(--SmartThemeBlurTintColor, rgba(128,128,128,.18))',
        border: '1px solid var(--SmartThemeBorderColor, rgba(128,128,128,.5))',
        'border-radius': '8px',
        'font-size': '13px',
        'line-height': '1.4',
    });
}

function makePreview(id) {
    const msg = chat[id];
    const raw = String(msg?.mes ?? '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/[*_`#>~]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    const snippet = raw.length > 60 ? raw.slice(0, 60) + '…' : raw;
    return { name: msg?.name ?? '', snippet };
}

function render(mes) {
    const id = Number(mes.getAttribute('mesid'));
    const folded = isFolded(id);                 // 저장된 접힘 상태
    const collapsed = folded && openId !== id;   // 실제로 접혀 보이는지 (임시로 펼친 경우 제외)

    mes.classList.toggle('mf-folded', collapsed);
    mes.classList.toggle('mf-pinned', folded);

    // 액션 아이콘: 저장 상태에 따라 같은 자리에서 교체
    const icon = mes.querySelector('.mes_fold');
    if (icon) {
        icon.classList.toggle(ICON_SET, !folded);
        icon.classList.toggle(ICON_UNSET, folded);
        icon.title = folded ? TITLE_UNSET : TITLE_SET;
    }

    // 높이만 풀어줌 (display/padding/폭은 테마 그대로 유지)
    const block = mes.querySelector('.mes_block');
    [mes, block].forEach((el) => {
        if (!el) return;
        if (collapsed) setImportant(el, { height: 'auto', 'min-height': '0', 'max-height': 'none', overflow: 'visible' });
        else clearImportant(el, FIX_PROPS);
    });

    const ph = mes.querySelector('.mf-placeholder');
    if (ph) {
        if (collapsed) {
            const { name, snippet } = makePreview(id);
            ph.replaceChildren();
            // 숨김(hide) 처리된 메시지(is_system)는 유령 아이콘, 그 외는 ▶
            let arrow;
            if (chat[id]?.is_system) {
                arrow = document.createElement('i');
                arrow.className = 'fa-solid fa-ghost';
                arrow.title = 'Hidden message';
            } else {
                arrow = document.createElement('span');
                arrow.textContent = '▶';
            }
            arrow.style.setProperty('flex', '0 0 auto');
            const nm = document.createElement('b');
            nm.textContent = name;
            nm.style.setProperty('flex', '0 0 auto');
            const tx = document.createElement('span');
            tx.textContent = snippet ? `— ${snippet}` : '';
            setImportant(tx, { 'min-width': '0', overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap', opacity: '0.8' });
            ph.append(arrow, nm, tx);
        }
        styleBar(ph, collapsed, block);
    }
}

function decorate(mes) {
    const id = Number(mes.getAttribute('mesid'));
    if (Number.isNaN(id) || !chat[id]) return;

    // 메시지 액션 버튼
    const buttons = mes.querySelector('.extraMesButtons');
    if (buttons && !buttons.querySelector('.mes_fold')) {
        const btn = document.createElement('div');
        btn.className = `mes_button mes_fold fa-solid ${ICON_SET} interactable`;
        btn.tabIndex = 0;
        btn.title = TITLE_SET;
        buttons.prepend(btn);
    }

    // 접혔을 때 메시지를 대신할 한 줄 바 (.mes_block 안 -> 기존 메시지 블록과 폭 동일)
    if (!mes.querySelector('.mf-placeholder')) {
        const ph = document.createElement('div');
        ph.className = 'mf-placeholder';
        ph.title = 'Click to expand temporarily';
        ph.tabIndex = 0;
        (mes.querySelector('.mes_block') ?? mes).append(ph);
    }

    render(mes);
}

function refreshAll() {
    document.querySelectorAll('#chat .mes').forEach(decorate);
}

let scheduled = false;
function scheduleRefresh() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
        scheduled = false;
        refreshAll();
    });
}

// 접기 설정 / 해제 (저장 상태 변경) - 액션 아이콘 & 길게 누르기 팝업 공용
async function toggleFold(mes) {
    const id = Number(mes.getAttribute('mesid'));
    const msg = chat[id];
    if (!msg) return;

    msg.extra ??= {};
    if (msg.extra[KEY]) {
        delete msg.extra[KEY];   // 해제
    } else {
        msg.extra[KEY] = true;   // 설정 → 바로 접히게
    }
    openId = null;

    render(mes);
    await saveChatConditional();
}

// 접힌 바를 눌렀을 때: 임시로 펼침 (저장 상태 변화 없음)
function openTemp(mes) {
    const id = Number(mes.getAttribute('mesid'));
    if (Number.isNaN(id) || !isFolded(id)) return;
    if (openId === id) return;
    openId = id;
    refreshAll();
}

// 임시로 펼친 메시지를 다시 접음
function closeTemp() {
    if (openId === null) return;
    openId = null;
    refreshAll();
}

function onDocumentClick(e) {
    const el = e.target;
    if (!(el instanceof Element)) return;

    // 1) 접기 설정/해제 아이콘
    const foldBtn = el.closest('.mes_fold');
    if (foldBtn) {
        const mes = foldBtn.closest('.mes');
        if (mes) toggleFold(mes);
        return;
    }

    // 2) 접힌 바 → 임시로 펼침 (다른 챗이 펼쳐져 있었다면 자동으로 접힘)
    const bar = el.closest('.mf-placeholder');
    if (bar) {
        const mes = bar.closest('.mes');
        if (mes) openTemp(mes);
        return;
    }

    // 3) 그 외: 임시로 펼쳐진 챗이 없으면 할 일 없음
    if (openId === null) return;

    // 상단바 / 하단바 / 팝업 등은 무시
    if (el.closest(IGNORE_SELECTOR)) return;

    // 펼쳐진 챗 자신을 누른 경우는 그대로 유지
    const mes = el.closest('#chat .mes');
    if (mes && Number(mes.getAttribute('mesid')) === openId) return;

    // 편집 중인 챗은 접지 않음
    const openMes = document.querySelector(`#chat .mes[mesid="${openId}"]`);
    if (openMes?.querySelector('#curEditTextarea')) return;

    // 다른 챗 / 빈 곳 → 다시 접기
    closeTemp();
}

// ===================== Long Press Menu =====================

const ctx = () => SillyTavern.getContext();

// Flat / Bubble 모드에서만 작동 (Document 모드 제외)
const styleEnabled = () => !document.body.classList.contains('documentstyle');

const escapeHtml = (t) => t.replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

const hasSelection = () => {
    const sel = window.getSelection();
    return !!sel && !sel.isCollapsed && sel.toString().length > 0;
};

// ===================== 선택한 텍스트 길게 누르기 메뉴 =====================

const SEL_HIT_PAD = 4;

// 현재 선택이 "한 메시지의 본문(.mes_text) 안"에 있을 때만 정보를 돌려줌
function getSelectionInfo() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    const rawText = range.toString();
    if (!rawText.trim()) return null;

    const elOf = (n) => (n.nodeType === Node.ELEMENT_NODE ? n : n.parentElement);
    const a = elOf(range.startContainer)?.closest('.mes_text');
    const b = elOf(range.endContainer)?.closest('.mes_text');
    if (!a || a !== b) return null;
    const mes = a.closest('.mes');
    if (!mes) return null;

    // 앞뒤 공백은 제외 (더블클릭 선택 시 뒤 공백이 딸려오는 경우 대비)
    const lead = rawText.length - rawText.trimStart().length;
    const text = rawText.trim();

    // 같은 글자가 여러 번 나올 때를 대비해, 선택 위치 앞에 같은 글자가 몇 번 있었는지 센다
    const pre = document.createRange();
    pre.selectNodeContents(a);
    pre.setEnd(range.startContainer, range.startOffset);
    const startOffset = pre.toString().length + lead;
    const full = a.textContent;
    let occurrence = 0;
    for (let i = full.indexOf(text); i !== -1 && i < startOffset; i = full.indexOf(text, i + 1)) occurrence++;

    return { mes, text, occurrence };
}

// (x, y) 가 현재 선택 영역 위인지
function pointOnSelection(x, y) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return false;
    for (const rc of sel.getRangeAt(0).getClientRects()) {
        if (x >= rc.left - SEL_HIT_PAD && x <= rc.right + SEL_HIT_PAD &&
            y >= rc.top - SEL_HIT_PAD && y <= rc.bottom + SEL_HIT_PAD) {
            return true;
        }
    }
    return false;
}

// 화면에 보이는 글자를 저장된 원문(chat[id].mes)에서 찾음
function findInRaw(raw, text, occurrence) {
    const idx = [];
    for (let i = raw.indexOf(text); i !== -1; i = raw.indexOf(text, i + 1)) idx.push(i);
    if (!idx.length) return null;
    const start = idx[occurrence] ?? (idx.length === 1 ? idx[0] : undefined);
    return start === undefined ? null : { start, end: start + text.length };
}

// 메시지 본문을 통째로 교체하고 저장 (SillyTavern 기본 편집 저장과 같은 순서)
async function setMessageText(id, next) {
    const msg = chat[id];
    if (!msg) return;
    msg.mes = next;
    if (Array.isArray(msg.swipes) && Number.isInteger(msg.swipe_id) && msg.swipes[msg.swipe_id] !== undefined) {
        msg.swipes[msg.swipe_id] = next;
    }
    updateMessageBlock(id, msg);
    await eventSource.emit(event_types.MESSAGE_EDITED, id);
    await eventSource.emit(event_types.MESSAGE_UPDATED, id);
    await saveChatConditional();
}

async function replaceSelection(id, text, occurrence, replacement) {
    const raw = String(chat[id]?.mes ?? '');
    const loc = findInRaw(raw, text, occurrence);
    if (!loc) {
        window.toastr?.warning('Could not locate the selected text in the message source.');
        return;
    }
    await setMessageText(id, raw.slice(0, loc.start) + replacement + raw.slice(loc.end));
}

const countOccurrences = (raw, text) => (text ? raw.split(text).length - 1 : 0);

async function showSelectionMenu(mes, info) {
    const id = Number(mes.getAttribute('mesid'));
    if (Number.isNaN(id) || !chat[id]) return;

    const { text, occurrence } = info;
    const name = chat[id].name || '';
    const preview = text.length > 80 ? text.slice(0, 80) + '…' : text;

    const html = `<h3>Selected text</h3>
        <div style="text-align:left;opacity:.8;margin-top:8px">
            <b>#${id}</b> ${escapeHtml(name)}<br>“${escapeHtml(preview)}”
        </div>`;

    const { callGenericPopup, POPUP_TYPE, POPUP_RESULT } = ctx();
    if (!callGenericPopup || !POPUP_TYPE) return;

    const CUSTOM_EDIT = POPUP_RESULT?.CUSTOM1 ?? 1001;
    const RESULT_CANCEL = POPUP_RESULT?.NEGATIVE ?? 0;

    // 윗줄 [Edit selection] [Delete selection] / 아랫줄 가운데 [Cancel]
    const result = await callGenericPopup(html, POPUP_TYPE.CONFIRM, '', {
        okButton: 'Delete selection',
        cancelButton: 'Cancel',
        defaultResult: RESULT_CANCEL,
        customButtons: [{ text: 'Edit selection', result: CUSTOM_EDIT }],
        onOpen: (popup) => {
            const controls = popup.buttonControls;
            const editBtn = controls?.querySelector(`[data-result="${CUSTOM_EDIT}"]`);
            if (!controls || !editBtn) return;
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:10px 20px;';
            row.append(editBtn, popup.okButton);
            controls.style.flexDirection = 'column';
            controls.style.alignItems = 'center';
            controls.style.gap = '10px';
            controls.prepend(row);
        },
    });

    let action = null;
    if (POPUP_RESULT ? result === POPUP_RESULT.AFFIRMATIVE : result === true) action = 'delete';
    else if (result === CUSTOM_EDIT) action = 'edit';
    if (!action) return;

    if (!mes.isConnected || Number(mes.getAttribute('mesid')) !== id) return;

    // 원문에 해당 글자가 없으면(매크로/정규식 등으로 화면과 원문이 다른 경우) 알림
    const raw0 = String(chat[id].mes ?? '');
    if (!raw0.includes(text)) {
        window.toastr?.warning('Could not locate the selected text in the message source.');
        return;
    }

    if (action === 'delete') {
        await replaceSelection(id, text, occurrence, '');
        return;
    }

    // ----- Edit selection: 바꿀 글자를 입력. 같은 글자가 여러 개면 "모두 바꾸기" 체크박스 표시 -----
    const total = countOccurrences(raw0, text);
    let replaceAll = false;
    const checkbox = total > 1
        ? `<label class="checkbox_label" style="justify-content:center;margin-top:10px">
               <input type="checkbox" id="mf-replace-all">
               <span>Replace all ${total} occurrences in this message</span>
           </label>`
        : '';

    const edited = await callGenericPopup(
        `<h3>Edit selection</h3>
         <div style="text-align:left;opacity:.8;margin-top:8px"><b>#${id}</b> ${escapeHtml(name)}</div>
         ${checkbox}`,
        POPUP_TYPE.INPUT,
        text,
        {
            rows: 4,
            okButton: 'Save',
            cancelButton: 'Cancel',
            onOpen: () => {
                const cb = document.getElementById('mf-replace-all');
                cb?.addEventListener('change', () => { replaceAll = cb.checked; });
            },
        },
    );
    if (typeof edited !== 'string' || edited === text) return;
    if (!mes.isConnected || Number(mes.getAttribute('mesid')) !== id) return;

    if (replaceAll) {
        const cur = String(chat[id]?.mes ?? '');
        if (!cur.includes(text)) {
            window.toastr?.warning('The message changed; nothing was replaced.');
            return;
        }
        await setMessageText(id, cur.split(text).join(edited));
        window.toastr?.success(`Replaced ${countOccurrences(cur, text)} occurrence(s).`);
    } else {
        await replaceSelection(id, text, occurrence, edited);
    }
}

// (x, y) 지점에 실제 글자가 있는지 판정 (본문 블록의 빈 공간은 false)
function isOnText(x, y) {
    let node = null;
    let offset = 0;
    if (document.caretPositionFromPoint) {
        const p = document.caretPositionFromPoint(x, y);
        if (!p) return false;
        node = p.offsetNode;
        offset = p.offset;
    } else if (document.caretRangeFromPoint) {
        const r = document.caretRangeFromPoint(x, y);
        if (!r) return false;
        node = r.startContainer;
        offset = r.startOffset;
    } else {
        return true;
    }
    if (!node || node.nodeType !== Node.TEXT_NODE) return false;

    const len = node.textContent.length;
    const range = document.createRange();
    const spans = [[Math.max(0, offset - 1), offset], [offset, Math.min(len, offset + 1)]];
    for (const [a, b] of spans) {
        if (a >= b) continue;
        range.setStart(node, a);
        range.setEnd(node, b);
        for (const rc of range.getClientRects()) {
            if (x >= rc.left - TEXT_HIT_PAD && x <= rc.right + TEXT_HIT_PAD &&
                y >= rc.top - TEXT_HIT_PAD && y <= rc.bottom + TEXT_HIT_PAD) {
                return true;
            }
        }
    }
    return false;
}

async function showLongPressMenu(mes) {
    const id = Number(mes.getAttribute('mesid'));
    if (Number.isNaN(id) || !chat[id]) return;

    const name = chat[id].name || '';
    const { snippet } = makePreview(id);
    const folded = isFolded(id);
    const hidden = !!chat[id].is_system;   // /hide 로 숨김 처리된 메시지

    const html = `<h3>Message options</h3>
        <div style="text-align:left;opacity:.8;margin-top:8px">
            <b>#${id}</b> ${escapeHtml(name)}<br>${escapeHtml(snippet)}
        </div>`;

    const { callGenericPopup, POPUP_TYPE, POPUP_RESULT, executeSlashCommandsWithOptions } = ctx();
    const CUSTOM_HIDE = POPUP_RESULT?.CUSTOM1 ?? 1001;
    const CUSTOM_FOLD = POPUP_RESULT?.CUSTOM2 ?? 1002;
    const RESULT_CANCEL = POPUP_RESULT?.NEGATIVE ?? 0;

    let action = null; // 'delete' | 'hide' | 'fold' | null
    if (callGenericPopup && POPUP_TYPE) {
        // OK 버튼(빨간색) = Delete.
        // 버튼 배치: 윗줄 [Hide] [Delete] [Fold] / 아랫줄 가운데 [Cancel]
        const result = await callGenericPopup(html, POPUP_TYPE.CONFIRM, '', {
            okButton: 'Delete',
            cancelButton: 'Cancel',
            defaultResult: RESULT_CANCEL,   // Enter / 기본 포커스는 Cancel (실수로 삭제 방지)
            customButtons: [
                { text: hidden ? 'Unhide' : 'Hide', result: CUSTOM_HIDE },
                { text: folded ? 'Unfold' : 'Fold', result: CUSTOM_FOLD },
            ],
            onOpen: (popup) => {
                const controls = popup.buttonControls;
                const hideBtn = controls.querySelector(`[data-result="${CUSTOM_HIDE}"]`);
                const foldBtn = controls.querySelector(`[data-result="${CUSTOM_FOLD}"]`);
                if (!controls || !hideBtn || !foldBtn) return;
                const row = document.createElement('div');
                row.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:10px 20px;';
                row.append(hideBtn, foldBtn, popup.okButton);
                controls.style.flexDirection = 'column';
                controls.style.alignItems = 'center';
                controls.style.gap = '10px';
                controls.prepend(row);   // Cancel 은 아랫줄 가운데에 남음
            },
        });
        if (POPUP_RESULT ? result === POPUP_RESULT.AFFIRMATIVE : result === true) action = 'delete';
        else if (result === CUSTOM_HIDE) action = 'hide';
        else if (result === CUSTOM_FOLD) action = 'fold';
    } else if (window.confirm('Delete this message?')) {
        action = 'delete';
    }
    if (!action) return;

    // 팝업 도중 채팅이 바뀌었는지 / 인덱스가 밀렸는지 확인
    if (!mes.isConnected || Number(mes.getAttribute('mesid')) !== id) return;

    if (action === 'fold') {
        await toggleFold(mes);
    } else if (action === 'hide') {
        // hide 는 is_system = true, unhide 는 false 로 저장됩니다.
        await executeSlashCommandsWithOptions(`/${hidden ? 'unhide' : 'hide'} ${id}`);
        if (mes.isConnected) render(mes);   // 접힌 바의 유령 아이콘 갱신
    } else {
        await executeSlashCommandsWithOptions(`/cut ${id}`);
    }
}

function initLongPress(chatEl) {
    let timer = null;       // 팝업을 띄우는 타이머
    let showTimer = null;   // 테두리를 보여주기 시작하는 타이머 (터치 전용)
    let pressedMes = null;
    let startX = 0, startY = 0;
    let fired = false;
    let releaseTimer = null;   // 팝업 뜬 뒤 테두리를 잠깐 유지했다가 지우는 타이머
    let releaseMes = null;
    // 'msg'  : 일반 길게 누르기
    // 'drag' : 마우스로 드래그(선택) 중 → 멈춰서 누르고 있으면 선택 메뉴
    // 'sel'  : 이미 선택된 글자 위에서 길게 누르기 → 선택 메뉴
    let mode = 'msg';
    let pressTouch = false;
    let holdMs = HOLD_MS_MOUSE;

    const releaseNow = () => {
        clearTimeout(releaseTimer);
        releaseTimer = null;
        if (releaseMes) {
            releaseMes.classList.remove('lpd-pressing', 'lpd-touch');
            releaseMes = null;
        }
    };

    const cancel = () => {
        clearTimeout(timer);
        clearTimeout(showTimer);
        timer = null;
        showTimer = null;
        if (pressedMes) {
            pressedMes.classList.remove('lpd-pressing', 'lpd-touch');
            pressedMes = null;
        }
    };

    const fireSelection = () => {
        const info = getSelectionInfo();
        if (!info) {
            cancel();
            return;
        }
        fired = true;
        cancel();
        window.getSelection()?.removeAllRanges();
        navigator.vibrate?.(30);
        showSelectionMenu(info.mes, info);
    };

    const fireMessage = () => {
        const target = pressedMes;
        fired = true;
        // 타이머만 정리하고, 테두리 클래스는 AFTER_POPUP_MS 뒤에 제거
        clearTimeout(timer);
        clearTimeout(showTimer);
        timer = null;
        showTimer = null;
        pressedMes = null;
        // 빨간 테두리 피드백은 터치(모바일)에서만 보여줌. 컴퓨터(마우스)에서는 표시 안 함.
        if (target && pressTouch) {
            target.classList.add('lpd-pressing');
            releaseMes = target;
            releaseTimer = setTimeout(releaseNow, AFTER_POPUP_MS);
        }
        window.getSelection()?.removeAllRanges();
        navigator.vibrate?.(30);
        if (target) showLongPressMenu(target);
    };

    const onHold = () => {
        if (mode === 'msg') {
            if (!hasSelection()) return fireMessage();
            // 터치에서 선택 진행 중이면 기존처럼 취소 (네이티브 선택 메뉴 우선)
            if (pressTouch) return cancel();
            // 마우스: 더블클릭 등으로 단어가 선택된 채 누르고 있으면 선택 메뉴
            return fireSelection();
        }
        fireSelection();   // 'drag' | 'sel'
    };

    chatEl.addEventListener('pointerdown', (e) => {
        fired = false;
        mode = 'msg';
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (!styleEnabled()) return;

        const mes = e.target.closest('.mes');
        if (!mes || e.target.closest(LP_IGNORE)) return;
        if (mes.querySelector('textarea.edit_textarea')) return; // 편집 중이면 무시

        const isTouch = e.pointerType !== 'mouse';
        const inText = !!e.target.closest('.mes_text');

        // 이미 선택된 글자 위를 누른 경우 → 선택 메뉴 모드
        const selHit = inText && hasSelection() && pointOnSelection(e.clientX, e.clientY);

        // 터치 + 본문 영역: 텍스트 선택을 방해하지 않도록 길게 누르기를 시작하지 않음
        if (!selHit && isTouch && TOUCH_TEXT_SELECTABLE && inText && isOnText(e.clientX, e.clientY)) return;

        releaseNow();
        cancel();
        pressTouch = isTouch;
        mode = selHit ? 'sel' : 'msg';
        holdMs = !isTouch ? HOLD_MS_MOUSE : (selHit ? HOLD_MS_TOUCH_SEL : HOLD_MS_TOUCH);

        pressedMes = mes;
        startX = e.clientX;
        startY = e.clientY;

        // 테두리 피드백은 터치 + 일반 길게 누르기에서만
        if (isTouch && mode === 'msg') {
            const visualMs = Math.min(VISUAL_MS, holdMs);
            mes.style.setProperty('--lpd-hold', `${visualMs}ms`);
            mes.classList.add('lpd-touch');   // iOS 콜아웃 방지 (텍스트 선택 자체는 막지 않음)
            showTimer = setTimeout(() => {
                if (pressedMes === mes) mes.classList.add('lpd-pressing');
            }, holdMs - visualMs);
        }

        timer = setTimeout(onHold, holdMs);
    });

    chatEl.addEventListener('pointermove', (e) => {
        if (!timer) return;
        if (Math.hypot(e.clientX - startX, e.clientY - startY) <= MOVE_TOLERANCE) return;

        // 마우스로 드래그해서 글자를 선택하는 중이면 취소하지 않고, 멈춘 지점부터 다시 시간을 잼
        if (!pressTouch && mode !== 'sel' && e.buttons === 1) {
            mode = 'drag';
            startX = e.clientX;
            startY = e.clientY;
            clearTimeout(timer);
            timer = setTimeout(onHold, holdMs);
            return;
        }
        cancel();
    });
    chatEl.addEventListener('pointerup', cancel);
    ['pointercancel', 'pointerleave'].forEach((ev) => chatEl.addEventListener(ev, () => {
        // 모바일에서 선택된 글자를 누르고 있을 때는 브라우저가 pointercancel 을 보내도 계속 대기
        // (손가락을 떼거나 크게 움직이거나 스크롤하면 취소됨)
        if (pressTouch && mode === 'sel') return;
        cancel();
    }));
    chatEl.addEventListener('scroll', cancel, { passive: true });

    // (터치) 텍스트 선택이 시작되면 대기 취소
    document.addEventListener('selectionchange', () => {
        if (timer && mode === 'msg' && pressTouch && hasSelection()) cancel();
    });

    // 길게 누른 직후 발생하는 click / contextmenu 차단
    // (캡처 단계에서 막으므로 접힌 바가 임시로 펼쳐지는 일도 없음)
    chatEl.addEventListener('click', (e) => {
        if (fired) { e.preventDefault(); e.stopPropagation(); fired = false; }
    }, true);
    chatEl.addEventListener('contextmenu', (e) => {
        if (timer || fired) e.preventDefault();
    });
}

jQuery(() => {
    const chatEl = document.getElementById('chat');
    if (!chatEl) return;

    document.addEventListener('click', onDocumentClick);

    chatEl.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const t = e.target.closest?.('.mes_fold, .mf-placeholder');
        if (!t) return;
        e.preventDefault();
        const mes = t.closest('.mes');
        if (!mes) return;
        if (t.classList.contains('mes_fold')) toggleFold(mes);
        else openTemp(mes);
    });

    new MutationObserver(scheduleRefresh).observe(chatEl, { childList: true });

    // 채팅이 바뀌거나 메시지가 삭제되면 id 가 달라질 수 있으므로 임시 펼침 상태 초기화
    ['CHAT_CHANGED', 'MESSAGE_DELETED'].forEach((name) => {
        if (event_types[name]) eventSource.on(event_types[name], () => { openId = null; });
    });

    [
        'CHAT_CHANGED',
        'CHARACTER_MESSAGE_RENDERED',
        'USER_MESSAGE_RENDERED',
        'MESSAGE_UPDATED',
        'MESSAGE_EDITED',
        'MESSAGE_SWIPED',
        'MESSAGE_DELETED',
        'MORE_MESSAGES_LOADED',
    ].forEach((name) => {
        if (event_types[name]) eventSource.on(event_types[name], scheduleRefresh);
    });

    initLongPress(chatEl);

    scheduleRefresh();
});
