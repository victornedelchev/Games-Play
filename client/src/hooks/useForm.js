import { useState } from "react";

export function useFormHook(initialValue, submitCallback) {
  const [values, setValues] = useState(initialValue);
  
  const changeHandler = (e) => {
    setValues((state) => ({
      ...state,
      [e.target.name]: e.target.value,
    }));
  };

  const submitHandler = (e) => {
    e.preventDefault();

    submitCallback(values);
  };

  return {
    values,
    changeHandler,
    submitHandler,
  };
}
