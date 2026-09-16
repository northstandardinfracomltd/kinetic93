import React, { useEffect, useRef } from 'react';

export interface SafeDateInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onValueChange?: (val: string) => void;
}

/**
 * SafeDateInput prevents browser native type="date" inputs from losing
 * typed day/month segments during keyboard entry in React.
 * 
 * Native date inputs have validity.badInput=true while day/month are partially
 * typed (e.g. typing "10" for day in "jj/mm/aaaa"), during which the native
 * value is empty string (""). If controlled directly in React, React would force
 * element.value = "", erasing the typed "10" as soon as the user finishes typing the day.
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

  // Synchronize when external value prop changes (e.g. edit different record, form reset)
  useEffect(() => {
    if (inputRef.current) {
      const currentVal = inputRef.current.value;
      const targetVal = value || '';
      if (currentVal !== targetVal) {
        // If user is actively typing and the date is incomplete (badInput), do not overwrite
        const isFocused = document.activeElement === inputRef.current;
        if (!isFocused || !inputRef.current.validity?.badInput) {
          inputRef.current.value = targetVal;
        }
      }
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
      inputRef.current.value = value || '';
    }
    if (onBlur) {
      onBlur(e);
    }
  };

  return (
    <input
      ref={inputRef}
      type="date"
      id={id}
      disabled={disabled}
      readOnly={readOnly}
      min={min}
      max={max}
      required={required}
      defaultValue={value || ''}
      onChange={handleChange}
      onBlur={handleBlur}
      className={className}
      style={style}
      {...rest}
    />
  );
};
