import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Input, UnstyledButton } from "@mantine/core";
import { helpText, parseTerm, pillKind, splitPills, suggestions } from "../search/searchTerms.js";
import { useSearchError, useSearchKeywords } from "../search/useSearch.js";
import { COMPONENTS_COPY } from "./copy.js";
import "./components.css";

// PillSearchInput is the search bar: finished terms show as pills, the term
// being typed gets autocomplete from the server's keyword table, and a search
// that doesn't parse says why under the bar. target is the search's kind,
// "decks" (the default) or "cards"; tags offers otag: and cctag: values as
// { otag: [{ value, description }], cctag: [...] }.
export function PillSearchInput({ value, onChange, placeholder, label, cardNames, playerNames, archetypes, eventCodes, tags, target = "decks" }) {
  const [inputValue, setInputValue] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef(null);
  const blurTimeout = useRef(null);
  const keywords = useSearchKeywords(target);
  const error = useSearchError(value, target);

  // The finished terms show as pills; the last, unfinished one is typed.
  const { pills: pillTerms, current: currentTyping } = splitPills(value || "");

  const sources = { cardNames, playerNames, archetypes, eventCodes, tags };
  const options = useMemo(
    () => suggestions(currentTyping, keywords, sources),
    [currentTyping, keywords, cardNames, playerNames, archetypes, eventCodes, tags],
  );
  const help = useMemo(() => helpText(currentTyping, keywords), [currentTyping, keywords]);

  // Sync selection index
  useEffect(() => {
    setSelectedIdx(0);
  }, [currentTyping]);

  // Update local input value when currentTyping changes from outside.
  useEffect(() => {
    setInputValue(currentTyping);
  }, [currentTyping]);

  // Global keyboard shortcut to focus the input.
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      // Ctrl+L (or Meta+L on Mac) to focus the search bar.
      if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
        e.preventDefault();
        focusInput();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // withTyped rebuilds the whole search from the pills and the typed term.
  const withTyped = (typed) => {
    const prefix = pillTerms.join(" ");
    return prefix ? `${prefix} ${typed}` : typed;
  };

  const handleInputChange = (e) => {
    const newVal = e.target.value;
    setInputValue(newVal);
    onChange({ target: { value: withTyped(newVal) } });
    setShowDropdown(true);
  };

  const applySuggestion = (suggestion) => {
    onChange({ target: { value: withTyped(suggestion.text) } });
    setInputValue(suggestion.text);

    // A color value grows a letter at a time, so the dropdown stays open.
    const parsed = parseTerm(suggestion.text, keywords);
    setShowDropdown(Boolean(parsed && parsed.keyword && parsed.keyword.kind === "color"));

    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (showDropdown && options.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx(prev => Math.min(prev + 1, options.length - 1));
        return;
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx(prev => Math.max(prev - 1, 0));
        return;
      } else if (e.key === "Tab" || e.key === "Enter") {
        if (currentTyping.length > 0) {
          e.preventDefault();
          applySuggestion(options[selectedIdx]);
          return;
        }
      }
    }

    if (e.key === "Escape") {
      setShowDropdown(false);
    }

    // If backspace is pressed and input is empty, remove the last pill.
    if (e.key === 'Backspace' && inputValue === "" && pillTerms.length > 0) {
      onChange({ target: { value: pillTerms.slice(0, -1).join(" ") } });
    }
  };

  const removePill = (index) => {
    const newPillTerms = [...pillTerms];
    newPillTerms.splice(index, 1);

    let fullString = newPillTerms.join(" ");
    if (inputValue) {
      fullString = fullString ? `${fullString} ${inputValue}` : inputValue;
    }
    onChange({ target: { value: fullString } });
  };

  const focusInput = () => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const onFocus = () => {
    if (blurTimeout.current) {
      clearTimeout(blurTimeout.current);
    }
    setShowDropdown(true);
  };

  const onBlur = () => {
    blurTimeout.current = setTimeout(() => {
      setShowDropdown(false);
    }, 150);
  };

  const showPanel = showDropdown && (options.length > 0 || help);

  return (
    <Input.Wrapper label={label} className="search-bar-container">
      <div className="pill-search-container" onClick={focusInput}>
        {pillTerms.map((term, index) => {
          const kind = pillKind(term, keywords);
          let pillClass = "search-pill";
          if (kind === "invalid") pillClass += " search-pill-invalid";
          else if (kind === "deck") pillClass += " search-pill-deck";

          return (
            <div key={`${term}-${index}`} className={pillClass}>
              <span>{term}</span>
              <UnstyledButton
                className="search-pill-remove"
                aria-label={COMPONENTS_COPY.pillSearchInput.removePill(term)}
                onClick={(e) => {
                  e.stopPropagation();
                  removePill(index);
                }}
              >×</UnstyledButton>
            </div>
          );
        })}
        <input
          ref={inputRef}
          type="text"
          className="pill-input"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={pillTerms.length === 0 ? placeholder : ""}
        />
      </div>

      {error && <div className="search-error" role="status">{error}</div>}

      {showPanel && (
        <div className="search-autocomplete pill-search-full">
          {help && (
            <div className="search-autocomplete-help">{help}</div>
          )}
          {options.map((suggestion, idx) => (
            <div
              key={suggestion.text}
              className={"search-autocomplete-item" + (idx === selectedIdx ? " search-autocomplete-item-selected" : "")}
              onMouseDown={(e) => {
                e.preventDefault();
                applySuggestion(suggestion);
              }}
              onMouseEnter={() => setSelectedIdx(idx)}
            >
              <span className="search-autocomplete-term">{suggestion.text}</span>
              <span className="search-autocomplete-detail">{suggestion.description}</span>
              {suggestion.example && <span className="search-autocomplete-example">{suggestion.example}</span>}
            </div>
          ))}
        </div>
      )}
    </Input.Wrapper>
  );
}
