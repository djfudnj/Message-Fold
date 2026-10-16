// Message Fold (Persistent)
// 메시지 객체의 extra.folded 값(true/없음)으로 접힘 상태를 저장합니다.
// is_system 처럼 chat.jsonl 에 함께 저장되므로 기기/브라우저가 달라도 유지됩니다.

import { chat, eventSource, event_types, saveChatConditional } from '../../../../script.js';

const KEY = 'folded';

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

function styleBar(ph, folded, block) {
    if (!folded) {
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

function render(mes, folded) {
    mes.classList.toggle('mf-folded', folded);

    const icon = mes.querySelector('.mes_fold');
    if (icon) {
        icon.classList.toggle('fa-chevron-up', !folded);
        icon.classList.toggle('fa-chevron-down', folded);
        icon.title = folded ? '메시지 펼치기' : '메시지 접기';
    }

    // 높이만 풀어줌 (display/padding/폭은 테마 그대로 유지)
    const block = mes.querySelector('.mes_block');
    [mes, block].forEach((el) => {
        if (!el) return;
        if (folded) setImportant(el, { height: 'auto', 'min-height': '0', 'max-height': 'none', overflow: 'visible' });
        else clearImportant(el, FIX_PROPS);
    });

    const ph = mes.querySelector('.mf-placeholder');
    if (ph) {
        if (folded) {
            const { name, snippet } = makePreview(Number(mes.getAttribute('mesid')));
            ph.replaceChildren();
            const arrow = document.createElement('span');
            arrow.textContent = '▶';
            const nm = document.createElement('b');
            nm.textContent = name;
            nm.style.setProperty('flex', '0 0 auto');
            const tx = document.createElement('span');
            tx.textContent = snippet ? `— ${snippet}` : '';
            setImportant(tx, { 'min-width': '0', overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap', opacity: '0.8' });
            ph.append(arrow, nm, tx);
        }
        styleBar(ph, folded, block);
    }
}

function decorate(mes) {
    const id = Number(mes.getAttribute('mesid'));
    if (Number.isNaN(id) || !chat[id]) return;

    // 메시지 액션 버튼
    const buttons = mes.querySelector('.extraMesButtons');
    if (buttons && !buttons.querySelector('.mes_fold')) {
        const btn = document.createElement('div');
        btn.className = 'mes_button mes_fold fa-solid fa-chevron-up interactable';
        btn.tabIndex = 0;
        btn.title = '메시지 접기';
        buttons.prepend(btn);
    }

    // 접혔을 때 메시지를 대신할 한 줄 바 (.mes_block 안 -> 기존 메시지 블록과 폭 동일)
    if (!mes.querySelector('.mf-placeholder')) {
        const ph = document.createElement('div');
        ph.className = 'mf-placeholder';
        ph.title = '클릭하여 펼치기';
        ph.tabIndex = 0;
        (mes.querySelector('.mes_block') ?? mes).append(ph);
    }

    render(mes, isFolded(id));
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

async function toggle(mes) {
    const id = Number(mes.getAttribute('mesid'));
    const msg = chat[id];
    if (!msg) return;

    msg.extra ??= {};
    if (msg.extra[KEY]) delete msg.extra[KEY];
    else msg.extra[KEY] = true;

    render(mes, !!msg.extra[KEY]);
    await saveChatConditional();
}

jQuery(() => {
    const chatEl = document.getElementById('chat');
    if (!chatEl) return;

    chatEl.addEventListener('click', (e) => {
        const target = e.target.closest('.mes_fold, .mf-placeholder');
        if (!target) return;
        const mes = target.closest('.mes');
        if (mes) toggle(mes);
    });
    chatEl.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const t = e.target.closest?.('.mes_fold, .mf-placeholder');
        if (t) {
            e.preventDefault();
            toggle(t.closest('.mes'));
        }
    });

    new MutationObserver(scheduleRefresh).observe(chatEl, { childList: true });

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

    scheduleRefresh();
});
