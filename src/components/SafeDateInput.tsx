import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Calendar, X } from 'lucide-react';

export interface SafeDateInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onValueChange?: (val: string) => void;
}

/**
 * SafeDateInput provides a segmented (Day / Month / Year) input format (jj/mm/aaaa)
 * with calendar picker integration.
 * 
 * This permanently resolves the native Chrome date input bug where typing the day (e.g. "10")
 * in an empty field causes Chrome to clear/delete the typed day when shifting highlight to "mm".
 */
export const SafeDateInput: React.FC<SafeDateInputProps> = ({
  value,
  onChange,
  onValueChange,
  id,
  name,
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
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);
  const dayRef = useRef<HTMLInputElement>(null);
  const monthRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);
  const nativePickerRef = useRef<HTMLInputElement>(null);

  // Parse external value prop into day, month, year
  const parseValue = useCallback((val: string) => {
    if (!val || typeof val !== 'string') {
      return { d: '', m: '', y: '' };
    }
    const cleanVal = val.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(cleanVal)) {
      const parts = cleanVal.substring(0, 10).split('-');
      return { y: parts[0], m: parts[1], d: parts[2] };
    }
    if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(cleanVal)) {
      const parts = cleanVal.split('/');
      return { d: parts[0].padStart(2, '0'), m: parts[1].padStart(2, '0'), y: parts[2] };
    }
    return { d: '', m: '', y: '' };
  }, []);

  // Synchronize when external value prop changes
  useEffect(() => {
    const { d, m, y } = parseValue(value);
    setDay(d);
    setMonth(m);
    setYear(y);
  }, [value, parseValue]);

  // Dispatch change event to parent with ISO format (YYYY-MM-DD) or empty string
  const emitChange = useCallback((isoVal: string) => {
    if (onChange) {
      const syntheticEvent = {
        target: {
          value: isoVal,
          name: name || '',
          id: id || '',
          type: 'date'
        },
        currentTarget: {
          value: isoVal,
          name: name || '',
          id: id || '',
          type: 'date'
        },
        bubbles: true,
        cancelable: false,
        defaultPrevented: false,
        eventPhase: 3,
        isTrusted: true,
        preventDefault: () => {},
        isDefaultPrevented: () => false,
        stopPropagation: () => {},
        isPropagationStopped: () => false,
        persist: () => {},
        timeStamp: Date.now(),
        nativeEvent: new Event('change')
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      onChange(syntheticEvent);
    }
    if (onValueChange) {
      onValueChange(isoVal);
    }
  }, [onChange, onValueChange, name, id]);

  const validateAndEmit = useCallback((d: string, m: string, y: string) => {
    if (!d && !m && !y) {
      emitChange('');
      return;
    }
    if (d && m && y && y.length === 4) {
      const dNum = parseInt(d, 10);
      const mNum = parseInt(m, 10);
      const yNum = parseInt(y, 10);
      if (mNum >= 1 && mNum <= 12 && dNum >= 1 && dNum <= 31 && yNum >= 1900 && yNum <= 2100) {
        const dPadded = d.padStart(2, '0');
        const mPadded = m.padStart(2, '0');
        const iso = `${yNum}-${mPadded}-${dPadded}`;
        emitChange(iso);
      }
    }
  }, [emitChange]);

  const handleDayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    if (raw.length <= 2) {
      setDay(raw);
      validateAndEmit(raw, month, year);
      if (raw.length === 2) {
        monthRef.current?.focus();
        monthRef.current?.select();
      }
    }
  };

  const handleMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    if (raw.length <= 2) {
      setMonth(raw);
      validateAndEmit(day, raw, year);
      if (raw.length === 2) {
        yearRef.current?.focus();
        yearRef.current?.select();
      }
    }
  };

  const handleYearChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    if (raw.length <= 4) {
      setYear(raw);
      validateAndEmit(day, month, raw);
    }
  };

  const handleDayKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === '/' || e.key === '-' || e.key === '.' || e.key === 'Enter') {
      e.preventDefault();
      if (day.length === 1) {
        const padded = `0${day}`;
        setDay(padded);
        validateAndEmit(padded, month, year);
      }
      monthRef.current?.focus();
      monthRef.current?.select();
    } else if (e.key === 'ArrowRight' && dayRef.current?.selectionStart === day.length) {
      monthRef.current?.focus();
      monthRef.current?.select();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const current = parseInt(day, 10) || 0;
      const next = current >= 31 ? 1 : current + 1;
      const nextStr = next.toString().padStart(2, '0');
      setDay(nextStr);
      validateAndEmit(nextStr, month, year);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const current = parseInt(day, 10) || 2;
      const prev = current <= 1 ? 31 : current - 1;
      const prevStr = prev.toString().padStart(2, '0');
      setDay(prevStr);
      validateAndEmit(prevStr, month, year);
    }
  };

  const handleMonthKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && month === '') {
      e.preventDefault();
      dayRef.current?.focus();
      dayRef.current?.select();
    } else if (e.key === '/' || e.key === '-' || e.key === '.' || e.key === 'Enter') {
      e.preventDefault();
      if (month.length === 1) {
        const padded = `0${month}`;
        setMonth(padded);
        validateAndEmit(day, padded, year);
      }
      yearRef.current?.focus();
      yearRef.current?.select();
    } else if (e.key === 'ArrowLeft' && monthRef.current?.selectionStart === 0) {
      dayRef.current?.focus();
      dayRef.current?.select();
    } else if (e.key === 'ArrowRight' && monthRef.current?.selectionStart === month.length) {
      yearRef.current?.focus();
      yearRef.current?.select();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const current = parseInt(month, 10) || 0;
      const next = current >= 12 ? 1 : current + 1;
      const nextStr = next.toString().padStart(2, '0');
      setMonth(nextStr);
      validateAndEmit(day, nextStr, year);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const current = parseInt(month, 10) || 2;
      const prev = current <= 1 ? 12 : current - 1;
      const prevStr = prev.toString().padStart(2, '0');
      setMonth(prevStr);
      validateAndEmit(day, prevStr, year);
    }
  };

  const handleYearKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && year === '') {
      e.preventDefault();
      monthRef.current?.focus();
      monthRef.current?.select();
    } else if (e.key === 'ArrowLeft' && yearRef.current?.selectionStart === 0) {
      monthRef.current?.focus();
      monthRef.current?.select();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const current = parseInt(year, 10) || new Date().getFullYear();
      const next = current + 1;
      setYear(next.toString());
      validateAndEmit(day, month, next.toString());
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const current = parseInt(year, 10) || new Date().getFullYear();
      const prev = current - 1;
      setYear(prev.toString());
      validateAndEmit(day, month, prev.toString());
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text').trim();
    if (!text) return;
    const { d, m, y } = parseValue(text);
    if (d && m && y) {
      e.preventDefault();
      setDay(d);
      setMonth(m);
      setYear(y);
      validateAndEmit(d, m, y);
    }
  };

  const handleCalendarClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (nativePickerRef.current) {
      if ('showPicker' in HTMLInputElement.prototype) {
        try {
          nativePickerRef.current.showPicker();
        } catch {
          nativePickerRef.current.focus();
          nativePickerRef.current.click();
        }
      } else {
        nativePickerRef.current.focus();
        nativePickerRef.current.click();
      }
    }
  };

  const handleNativePickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val) {
      const { d, m, y } = parseValue(val);
      setDay(d);
      setMonth(m);
      setYear(y);
      emitChange(val);
    } else {
      setDay('');
      setMonth('');
      setYear('');
      emitChange('');
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDay('');
    setMonth('');
    setYear('');
    emitChange('');
    dayRef.current?.focus();
  };

  const handleContainerClick = (e: React.MouseEvent) => {
    if (
      document.activeElement !== dayRef.current &&
      document.activeElement !== monthRef.current &&
      document.activeElement !== yearRef.current
    ) {
      dayRef.current?.focus();
    }
  };

  const handleContainerBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (containerRef.current && !containerRef.current.contains(e.relatedTarget as Node)) {
      if (onBlur) {
        onBlur(e as unknown as React.FocusEvent<HTMLInputElement>);
      }
    }
  };

  const currentIso = day && month && year && year.length === 4
    ? `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    : '';

  const hasValue = Boolean(day || month || year);

  return (
    <div
      ref={containerRef}
      onClick={handleContainerClick}
      onBlur={handleContainerBlur}
      onPaste={handlePaste}
      className={`relative inline-flex items-center justify-between min-h-[30px] border border-slate-200 rounded text-xs bg-white text-slate-700 transition-colors focus-within:ring-1 focus-within:ring-blue-500 focus-within:border-blue-500 ${
        disabled ? 'bg-slate-100 text-slate-400 cursor-not-allowed opacity-80' : ''
      } ${className || ''}`}
      style={style}
    >
      <div className="flex items-center space-x-1 select-none font-mono">
        <input
          ref={dayRef}
          id={id}
          name={name ? `${name}_day` : undefined}
          type="text"
          inputMode="numeric"
          maxLength={2}
          placeholder="jj"
          value={day}
          disabled={disabled}
          readOnly={readOnly}
          required={required}
          onChange={handleDayChange}
          onKeyDown={handleDayKeyDown}
          className="w-5 text-center bg-transparent border-none p-0 outline-none focus:bg-blue-100/70 focus:text-blue-900 rounded-sm font-mono text-inherit placeholder:text-slate-400 placeholder:font-sans"
          aria-label="Jour"
        />
        <span className="text-slate-300 font-bold select-none text-[11px] leading-none">/</span>
        <input
          ref={monthRef}
          name={name ? `${name}_month` : undefined}
          type="text"
          inputMode="numeric"
          maxLength={2}
          placeholder="mm"
          value={month}
          disabled={disabled}
          readOnly={readOnly}
          onChange={handleMonthChange}
          onKeyDown={handleMonthKeyDown}
          className="w-5 text-center bg-transparent border-none p-0 outline-none focus:bg-blue-100/70 focus:text-blue-900 rounded-sm font-mono text-inherit placeholder:text-slate-400 placeholder:font-sans"
          aria-label="Mois"
        />
        <span className="text-slate-300 font-bold select-none text-[11px] leading-none">/</span>
        <input
          ref={yearRef}
          name={name ? `${name}_year` : undefined}
          type="text"
          inputMode="numeric"
          maxLength={4}
          placeholder="aaaa"
          value={year}
          disabled={disabled}
          readOnly={readOnly}
          onChange={handleYearChange}
          onKeyDown={handleYearKeyDown}
          className="w-9 text-center bg-transparent border-none p-0 outline-none focus:bg-blue-100/70 focus:text-blue-900 rounded-sm font-mono text-inherit placeholder:text-slate-400 placeholder:font-sans"
          aria-label="Année"
        />
      </div>

      <div className="flex items-center space-x-1 pl-1.5 ml-auto">
        {hasValue && !disabled && !readOnly && (
          <button
            type="button"
            tabIndex={-1}
            onClick={handleClear}
            title="Effacer la date"
            className="p-0.5 text-slate-300 hover:text-slate-600 rounded focus:outline-none transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        )}

        {!disabled && !readOnly && (
          <div className="relative flex items-center">
            <button
              type="button"
              tabIndex={-1}
              onClick={handleCalendarClick}
              title="Sélectionner sur le calendrier"
              className="p-0.5 text-slate-400 hover:text-blue-600 rounded focus:outline-none transition-colors"
            >
              <Calendar className="w-3.5 h-3.5" />
            </button>
            <input
              ref={nativePickerRef}
              type="date"
              tabIndex={-1}
              aria-hidden="true"
              className="sr-only pointer-events-none"
              value={currentIso}
              min={min}
              max={max}
              onChange={handleNativePickerChange}
            />
          </div>
        )}
      </div>
    </div>
  );
};

