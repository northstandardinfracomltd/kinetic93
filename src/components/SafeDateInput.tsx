import React, { useEffect, useRef, useState } from 'react';
import { toISODateOnly } from '../utils';

export interface SafeDateInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: any;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onValueChange?: (val: string) => void;
}

/**
 * SafeDateInput prevents browser native type="date" inputs from losing
 * typed day/month segments during keyboard entry in React, and automatically
 * normalizes any French/timestamp/object date format into valid ISO YYYY-MM-DD.
 * Also displays a clear button when a date is filled (even partially).
 */
export const SafeDateInput: React.FC<SafeDateInputProps> = ({
  value,
  onChange,
  onValueChange,
  id,
  className,
  style,
  disabled,
  readOnly,
  min,
  max,
  required,
  onBlur,
  ...rest
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [hasContent, setHasContent] = useState<boolean>(() => Boolean(toISODateOnly(value)));

  // Synchronize when external value prop changes (e.g. edit different record, form reset)
  useEffect(() => {
    const targetVal = toISODateOnly(value);
    if (inputRef.current) {
      const currentVal = inputRef.current.value;
      if (currentVal !== targetVal) {
        // If user is actively typing and the date is incomplete (badInput), do not overwrite
        const isFocused = document.activeElement === inputRef.current;
        if (!isFocused || !inputRef.current.validity?.badInput) {
          inputRef.current.value = targetVal;
        }
      }
      setHasContent(Boolean(inputRef.current.value || inputRef.current.validity?.badInput || targetVal));
    } else {
      setHasContent(Boolean(targetVal));
    }
  }, [value]);

  const syncHasContent = (el: HTMLInputElement | null) => {
    if (!el) return;
    setHasContent(Boolean(el.value || el.validity?.badInput));
  };

  const handleInput = (e: React.FormEvent<HTMLInputElement>) => {
    syncHasContent(e.currentTarget);
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    syncHasContent(e.currentTarget);
    if (rest.onKeyUp) {
      rest.onKeyUp(e);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    syncHasContent(e.target);
    // If the input has incomplete/partial date segments, do not update React state
    // so React does not re-render and erase the partially typed digits.
    if (e.target.validity?.badInput) {
      return;
    }

    if (onChange) {
      onChange(e);
    }
    if (onValueChange) {
      onValueChange(e.target.value);
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    // On blur, if the user left an incomplete/invalid date, restore the last valid value from prop
    if (inputRef.current && inputRef.current.validity?.badInput) {
      inputRef.current.value = toISODateOnly(value);
    }
    syncHasContent(inputRef.current);
    if (onBlur) {
      onBlur(e);
    }
  };

  const handleClear = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (inputRef.current) {
      inputRef.current.value = '';
    }
    setHasContent(false);
    if (onChange) {
      const syntheticEvent = {
        target: { value: '', id: id || '' },
        currentTarget: { value: '', id: id || '' },
      } as React.ChangeEvent<HTMLInputElement>;
      onChange(syntheticEvent);
    }
    if (onValueChange) {
      onValueChange('');
    }
  };

  const showClearButton = hasContent && !disabled && !readOnly;

  return (
    <div className="relative w-full flex items-center">
      <input
        ref={inputRef}
        type="date"
        id={id}
        disabled={disabled}
        readOnly={readOnly}
        min={min}
        max={max}
        required={required}
        defaultValue={toISODateOnly(value)}
        onInput={handleInput}
        onKeyUp={handleKeyUp}
        onChange={handleChange}
        onBlur={handleBlur}
        className={className}
        style={showClearButton ? { ...style, paddingRight: '34px' } : style}
        {...rest}
      />
      {showClearButton && (
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={handleClear}
          onClick={handleClear}
          style={{
            position: 'absolute',
            right: '8px',
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'transparent',
            backgroundColor: 'transparent',
            border: 'none',
            boxShadow: 'none',
            padding: '2px',
            margin: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 10,
          }}
          title="Effacer la date"
        >
          <img
            src="https://civilprom.s3.eu-north-1.amazonaws.com/close-black.svg"
            alt=""
            style={{ width: '22px', height: '22px', objectFit: 'contain', display: 'block', pointerEvents: 'none' }}
            referrerPolicy="no-referrer"
          />
        </button>
      )}
    </div>
  );
};
