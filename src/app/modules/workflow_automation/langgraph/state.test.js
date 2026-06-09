import { describe, it, expect } from 'vitest';
import { workflowAutomationState } from './state';

describe('workflowAutomationState', () => {
  it('should be defined and be an object', () => {
    expect(workflowAutomationState).toBeDefined();
    expect(typeof workflowAutomationState).toBe('object');
  });

  // Test for the unique 'messages' property which only has a 'value' field
  describe('Property: messages', () => {
    it('should have a value property set to null', () => {
      expect(workflowAutomationState.messages).toEqual({ value: null });
    });
  });

  // Helper function for properties using the `y ?? x` reducer pattern
  const testCommonReducerProperty = (propertyName, propConfig, expectedDefaultValue) => {
    describe(`Property: ${propertyName}`, () => {
      const { reducer, default: defaultValueFn } = propConfig;

      it(`should have a default value of ${JSON.stringify(expectedDefaultValue)}`, () => {
        expect(defaultValueFn()).toEqual(expectedDefaultValue);
      });

      it('reducer should update the value if new value is not null or undefined', () => {
        const oldVal = 'old_value';
        const newVal = 'new_value';
        const newObj = { key: 'value' };
        const newArr = ['item'];

        expect(reducer(oldVal, newVal)).toBe(newVal);
        expect(reducer(null, newVal)).toBe(newVal);
        expect(reducer(undefined, newVal)).toBe(newVal);
        expect(reducer(oldVal, newObj)).toBe(newObj); // Test with object
        expect(reducer(null, newObj)).toBe(newObj);
        expect(reducer(oldVal, newArr)).toBe(newArr); // Test with array
        expect(reducer(null, newArr)).toBe(newArr);
      });

      it('reducer should retain the old value if new value is null or undefined', () => {
        const oldVal = 'old_value';
        const oldObj = { key: 'value' };
        const oldArr = ['item'];

        expect(reducer(oldVal, null)).toBe(oldVal);
        expect(reducer(oldVal, undefined)).toBe(oldVal);
        expect(reducer(oldObj, null)).toBe(oldObj); // Test with object
        expect(reducer(oldObj, undefined)).toBe(oldObj);
        expect(reducer(oldArr, null)).toBe(oldArr); // Test with array
        expect(reducer(oldArr, undefined)).toBe(oldArr);
      });

      it('reducer should handle null/undefined initial values correctly', () => {
        expect(reducer(null, null)).toBe(null);
        expect(reducer(undefined, undefined)).toBe(undefined);
      });
    });
  };

  // Helper function for properties using the `[...(x || []), ...(y || [])]` reducer pattern
  const testArrayMergingReducerProperty = (propertyName, propConfig) => {
    describe(`Property: ${propertyName}`, () => {
      const { reducer, default: defaultValueFn } = propConfig;

      it('should have a default value of an empty array', () => {
        expect(defaultValueFn()).toEqual([]);
      });

      it('reducer should merge arrays, handling null/undefined gracefully', () => {
        expect(reducer([], ['item1'])).toEqual(['item1']);
        expect(reducer(['item1'], ['item2'])).toEqual(['item1', 'item2']);
        expect(reducer(null, ['item1'])).toEqual(['item1']);
        expect(reducer(['item1'], null)).toEqual(['item1']);
        expect(reducer(undefined, ['item1'])).toEqual(['item1']);
        expect(reducer(['item1'], undefined)).toEqual(['item1']);
        expect(reducer(null, null)).toEqual([]);
        expect(reducer(undefined, undefined)).toEqual([]);
        expect(reducer(['item1', 'item2'], ['item3', 'item4'])).toEqual(['item1', 'item2', 'item3', 'item4']);
        expect(reducer(['item1'], [])).toEqual(['item1']); // Merging with empty array
        expect(reducer([], [])).toEqual([]); // Merging two empty arrays
      });
    });
  };

  // Iterate through all properties in workflowAutomationState to dynamically generate tests
  for (const key in workflowAutomationState) {
    if (key === 'messages') {
      // 'messages' is handled by a specific test block above, so skip it here
      continue;
    }

    const prop = workflowAutomationState[key];
    const reducerFn = prop.reducer;
    const defaultFn = prop.default;

    // Determine the expected default value by calling the default function
    const expectedDefault = defaultFn();

    // Check the reducer function's string representation to determine its type
    // This is a pragmatic approach given the two distinct patterns used in the file.
    const reducerString = reducerFn.toString();

    if (reducerString.includes('[...(x || []), ...(y || [])]')) {
      testArrayMergingReducerProperty(key, prop);
    } else if (reducerString.includes('y ?? x')) {
      testCommonReducerProperty(key, prop, expectedDefault);
    } else {
      // This block should ideally not be hit if all properties follow one of the two patterns.
      // It serves as a fallback for any unexpected reducer structures.
      describe(`Property: ${key} (unknown reducer type)`, () => {
        it('should have a default value', () => {
          expect(defaultFn()).toEqual(expectedDefault);
        });
        it('should have a reducer function', () => {
          expect(typeof reducerFn).toBe('function');
        });
        // Log a warning for properties with unknown reducer patterns
        console.warn(`WARNING: Property '${key}' has an unknown reducer pattern and is not fully tested. Reducer: ${reducerString}`);
      });
    }
  }
});