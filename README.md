# Message Fold and Delete

A SillyTavern extension that lets you fold long messages into a single bar, and manage messages or selected text with a long press.

## Features

* **Fold / Unfold** – Click the fold icon in a message's action buttons to collapse it into a slim bar.
* **Peek** – Tap a folded bar to open it temporarily. Tap elsewhere and it folds again. (To fully restore the message, click the uncollapse icon again.)

* **Long press menu** – Press and hold a message to get a popup: Hide / Unhide, Delete, Fold / Unfold, or Cancel. The delete option works almost the same as SillyTavern's built-in "Delete this message", but it's more convenient: you don't need to open the edit window first.
* **Selected text menu** – Select some text inside a message, then press and hold to get a popup: Edit selection, Delete selection, or Cancel.
* **Desktop:** drag to select, then hold the mouse button still at the end of the drag (or press and hold on the already-selected text).
* **Mobile:** select text as usual (the Copy / Select all toolbar appears), then press and hold the selected text a bit longer.


* **Replace all** – If the selected text appears more than once in the message, Edit selection shows a "Replace all" checkbox. Type the new text, check the box, and every occurrence in that message is replaced at once (e.g. change every "potato" to "carrot").

## Notes

* Text is matched against the message's saved source, so text that differs on screen (macros like {{user}}, regex scripts) or selections that span multiple paragraphs may not be found. In that case a warning is shown and nothing is changed.
* "Replace all" matches the exact text (case-sensitive) in the whole saved message, including parts not visible on screen such as markdown marks.
* On some mobile browsers, the browser's own long-press behavior may take priority over the selected text menu.

<br><br><br><br>


# Message Fold and Delete

긴 메시지를 한 줄 바로 접고, 길게 눌러서 메시지나 선택한 글자를 관리할 수 있는 SillyTavern 확장입니다.

## 주요 기능

* **접기 / 펼치기** – 메시지 액션 버튼의 접기 아이콘을 누르면 메시지가 얇게 접힙니다.
* **미리보기** – 접힌 바를 누르면 임시로 펼쳐지고, 다른 곳을 누르면 다시 접힌 상태로 되돌아옵니다. (접힌 상태를 완전히 해제하려면 해제 아이콘을 다시 누르세요)

* **길게 누르기 메뉴** – 메시지를 길게 누르면 팝업이 뜹니다 : Hide / Unhide(숨기기/숨김 해제), Delete(삭제), Fold / Unfold(접기/펼치기), Cancel(취소). 삭제 기능은 SillyTavern 기본 "메시지 삭제"와 동일하게 작동하지만, 편집 창을 따로 열 필요가 없어 더 편리합니다.
* **선택한 글자 메뉴** – 메시지 안의 글자를 선택한 뒤 길게 누르면 팝업이 뜹니다 : Edit selection(선택 부분 수정), Delete selection(선택 부분 삭제), Cancel(취소).
* **컴퓨터:** 드래그로 글자를 선택하고, 드래그가 끝나는 지점에서 마우스를 떼지 않고 가만히 누르고 있거나, 이미 선택된 글자 위를 길게 누르세요.
* **모바일:** 평소처럼 글자를 선택해서 복사 / 모두 선택 툴바가 뜬 상태에서, 선택된 글자를 더 길게 누르세요.


* **모두 바꾸기** – 선택한 글자가 메시지 안에 여러 번 나오면, Edit selection 창에 "모두 바꾸기" 체크박스가 나타납니다. 바꿀 글자를 입력하고 체크한 뒤 저장하면 그 메시지 안의 해당 글자가 한 번에 모두 바뀝니다. (예: "감자" → "당근")

## 참고 사항

* 화면에 보이는 글자를 저장된 원문에서 찾아 바꾸기 때문에, 매크로({{user}})나 정규식으로 화면과 원문이 달라진 부분, 여러 문단에 걸친 선택은 찾지 못할 수 있습니다. 이 경우 안내 메시지가 뜨고 아무것도 바뀌지 않습니다.
* "모두 바꾸기"는 대소문자를 구분하며, 마크다운 표시처럼 화면에 보이지 않는 부분을 포함해 저장된 메시지 전체에서 글자를 찾아 바꿉니다.
* 일부 모바일 브라우저에서는 브라우저 자체의 길게 누르기 동작이 먼저 실행되어 선택한 글자 메뉴가 뜨지 않을 수 있습니다.
