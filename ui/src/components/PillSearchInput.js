import React, { useState, useEffect, useRef, useMemo } from 'react';
import { parseTerms, isTermQuery, QueryTermMetadata } from '../utils/Query.js';

// Pure helper functions for autocomplete logic
function computeSuggestions(fragment, cardNames, playerNames, archetypes) {
  const lower = fragment.toLowerCase();

  // Check if we are typing a value for a specific term (e.g., color:)
  for (const meta of QueryTermMetadata) {
    for (const op of meta.operators) {
      const prefix = meta.term + op;
      if (lower.startsWith(prefix)) {
        const valuePart = lower.substring(prefix.length);

        // Special case for card names when typing 'name:'
        if (meta.term === "name" && cardNames && cardNames.length > 0) {
          return cardNames
            .filter(name => name.toLowerCase().includes(valuePart.toLowerCase()))
            .slice(0, 10)
            .map(name => ({
              term: name.includes(" ") ? `"${name}"` : name,
              description: "Card Name",
              isValue: true,
              prefix: prefix
            }));
        }

        // Archetypes when typing 'arch:'
        if (meta.term === "arch" && archetypes && archetypes.length > 0) {
          return archetypes
            .filter(a => a.toLowerCase().includes(valuePart.toLowerCase()))
            .slice(0, 10)
            .map(a => ({
              term: a.includes(" ") ? `"${a}"` : a,
              description: "Archetype",
              isValue: true,
              prefix: prefix
            }));
        }

        // Player names when typing 'player:'
        if (meta.term === "player" && playerNames && playerNames.length > 0) {
          return playerNames
            .filter(p => p.toLowerCase().includes(valuePart.toLowerCase()))
            .slice(0, 10)
            .map(p => ({
              term: p.includes(" ") ? `"${p}"` : p,
              description: "Player Name",
              isValue: true,
              prefix: prefix
            }));
        }
        
        // For color, we often want to append more colors, so suggest remaining valid ones.
        if ((meta.term === "color" || meta.term === "dcolor") && meta.values) {
          return meta.values
            .filter(v => !valuePart.includes(v))
            .map(v => ({
              term: valuePart + v,
              description: `Add ${v.toUpperCase()} color`,
              isValue: true,
              prefix: prefix
            }));
        }

        // General value suggestions (e.g., for types)
        if (meta.values) {
          return meta.values
            .filter(v => v.toLowerCase().startsWith(valuePart.toLowerCase()))
            .map(v => ({
              term: v,
              description: `${meta.description}: ${v}`,
              isValue: true,
              prefix: prefix
            }));
        }
      }
    }
  }

  // If the fragment contains an operator but no predefined values (and isn't special), no suggestions.
  if (lower && QueryTermMetadata.some(m => m.operators.some(op => lower.startsWith(m.term + op)))) {
    return [];
  }

  // If we have playerNames, suggest those for non-term fragments.
  let results = [];
  if (lower) {
    if (playerNames && playerNames.length > 0) {
      const matchingPlayers = playerNames
        .filter(name => name.toLowerCase().includes(lower))
        .slice(0, 5)
        .map(name => ({
          term: name.includes(" ") ? `"${name}"` : name,
          description: "Player Name",
          isPlayer: true
        }));
      results = results.concat(matchingPlayers);
    }
  }

  if (results.length > 0) {
    return results.slice(0, 12);
  }

  // If empty, show all terms.
  if (!lower) {
    return QueryTermMetadata;
  }

  // Filter to matching terms.
  return QueryTermMetadata.filter(m => m.term.startsWith(lower));
}

function computeHelpText(fragment) {
  const lower = fragment.toLowerCase();
  for (const meta of QueryTermMetadata) {
    for (const op of meta.operators) {
      if (lower.startsWith(meta.term + op)) {
        const valueHint = meta.valueType === "number" ? "number" : meta.valueType === "color" ? "color code (e.g. ug, wbr)" : "text";
        return `Expects ${valueHint} — e.g. ${meta.example}`;
      }
    }
  }
  return null;
}

function isPillValid(term) {
  const lower = term.toLowerCase();
  for (const meta of QueryTermMetadata) {
    for (const op of meta.operators) {
      const prefix = meta.term + op;
      if (lower.startsWith(prefix)) {
        const value = lower.substring(prefix.length);
        
        // Validation logic depends on the term
        if (meta.term === "color" || meta.term === "dcolor") {
          // color queries must be strictly valid
          return value.length > 0 && value.split("").every(c => meta.values.includes(c));
        }

        if (meta.term === "t" || meta.term === "arch" || meta.term === "player" || meta.term === "name") {
          // These allow anything, just need a value.
          return value.length > 0;
        }

        if (meta.values) {
          // For other terms with explicit values, check if it's one of them.
          return meta.values.some(v => v.toLowerCase() === value.toLowerCase());
        }

        if (meta.valueType === "number" || meta.term === "draftSize") {
          return !isNaN(parseInt(value));
        }

        return value.length > 0;
      }
    }
  }
  // If it's not a term query, it's just a name/fuzzy search, which is always "valid"
  return true;
}

function getPillType(term, playerNames) {
  const lower = term.toLowerCase();
  for (const meta of QueryTermMetadata) {
    for (const op of meta.operators) {
      const prefix = (meta.term + op).toLowerCase();
      if (lower.startsWith(prefix)) {
        if (meta.isDeckOnly) return 'deck';
        return 'card';
      }
    }
  }
  
  // Fuzzy search - if it's a known player name, treat as deck pill.
  if (playerNames && playerNames.some(p => p.toLowerCase() === lower.replace(/"/g, ""))) {
    return 'deck';
  }
  
  return 'card';
}

export function PillSearchInput({ value, onChange, placeholder, label, cardNames, playerNames, archetypes }) {
  const [inputValue, setInputValue] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef(null);
  const blurTimeout = useRef(null);

  // We want to split the full value into "pills" (complete terms)
  // and "current typing" (the part being typed).
  const terms = parseTerms(value || "");

  // Determine which terms are "complete" (should be pills).
  const isEndsWithSpace = value && value.endsWith(" ");
  const pillTerms = isEndsWithSpace ? terms : terms.slice(0, -1);
  const currentTyping = isEndsWithSpace ? "" : (terms[terms.length - 1] || "");

  // Autocomplete state
  const suggestions = useMemo(() => computeSuggestions(currentTyping, cardNames, playerNames, archetypes), [currentTyping, cardNames, playerNames, archetypes]);
  const helpText = useMemo(() => computeHelpText(currentTyping), [currentTyping]);

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

  const handleInputChange = (e) => {
    const newVal = e.target.value;
    setInputValue(newVal);

    // Reconstruct the full string.
    const prefix = pillTerms.join(" ");
    const fullString = prefix ? `${prefix} ${newVal}` : newVal;

    onChange({ target: { value: fullString } });
    setShowDropdown(true);
  };

  const applySuggestion = (suggestion) => {
    const prefix = pillTerms.join(" ");
    let newVal;
    if (suggestion.isValue) {
      newVal = suggestion.prefix + suggestion.term;
    } else if (suggestion.isCard || suggestion.isPlayer) {
      newVal = suggestion.term;
    } else {
      newVal = suggestion.term + suggestion.operators[0];
    }
    
    const fullString = prefix ? `${prefix} ${newVal}` : newVal;

    onChange({ target: { value: fullString } });
    setInputValue(newVal);
    
    // If it was a color value suggestion, keep dropdown open so they can add more colors.
    if (suggestion.prefix && (suggestion.prefix.startsWith("color") || suggestion.prefix.startsWith("dcolor"))) {
      setShowDropdown(true);
    } else {
      setShowDropdown(false);
    }

    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (showDropdown && suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx(prev => Math.min(prev + 1, suggestions.length - 1));
        return;
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx(prev => Math.max(prev - 1, 0));
        return;
      } else if (e.key === "Tab" || e.key === "Enter") {
        if (currentTyping.length > 0) {
          e.preventDefault();
          applySuggestion(suggestions[selectedIdx]);
          return;
        }
      }
    }

    if (e.key === "Escape") {
      setShowDropdown(false);
    }

    // If backspace is pressed and input is empty, remove the last pill.
    if (e.key === 'Backspace' && inputValue === "" && pillTerms.length > 0) {
      const newPillTerms = pillTerms.slice(0, -1);
      const fullString = newPillTerms.join(" ");
      onChange({ target: { value: fullString } });
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

  const showPanel = showDropdown && (suggestions.length > 0 || helpText);

  return (
    <div className="search-bar-container" style={{position: 'relative'}}>
      {label && <label className="player-frame-title" style={{marginBottom: '0.5rem'}}>{label}</label>}
      <div className="pill-search-container" onClick={focusInput}>
        {pillTerms.map((term, index) => {
          const isValid = isPillValid(term);
          const type = getPillType(term, playerNames);
          let pillClass = "search-pill";
          if (!isValid) pillClass += " search-pill-invalid";
          else if (type === 'deck') pillClass += " search-pill-deck";

          return (
            <div key={`${term}-${index}`} className={pillClass}>
              <span>{term}</span>
              <div className="search-pill-remove" onClick={(e) => {
                e.stopPropagation();
                removePill(index);
              }}>×</div>
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

      {showPanel && (
        <div className="search-autocomplete" style={{width: '100%'}}>
          {helpText && (
            <div className="search-autocomplete-help">{helpText}</div>
          )}
          {suggestions.map((suggestion, idx) => {
            const termDisplay = suggestion.isValue ? suggestion.term : (suggestion.term + (suggestion.operators ? suggestion.operators[0] : ""));
            return (
              <div
                key={idx}
                className={"search-autocomplete-item" + (idx === selectedIdx ? " search-autocomplete-item-selected" : "")}
                onMouseDown={(e) => {
                  e.preventDefault();
                  applySuggestion(suggestion);
                }}
                onMouseEnter={() => setSelectedIdx(idx)}
              >
                <span className="search-autocomplete-term">{termDisplay}</span>
                <span className="search-autocomplete-detail">{suggestion.description}</span>
                {suggestion.example && <span className="search-autocomplete-example">{suggestion.example}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
