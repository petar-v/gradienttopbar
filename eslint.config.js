import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';

export default [
    eslint.configs.recommended,
    prettier,
    {
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
            globals: {
                ARGV: 'readonly',
                Debugger: 'readonly',
                GIRepositoryGType: 'readonly',
                globalThis: 'readonly',
                global: 'readonly',
                imports: 'readonly',
                Intl: 'readonly',
                log: 'readonly',
                logError: 'readonly',
                print: 'readonly',
                printerr: 'readonly',
                window: 'readonly',
                TextEncoder: 'readonly',
                TextDecoder: 'readonly'
            }
        },
        rules: {
            'array-bracket-newline': ['error', 'consistent'],
            'array-bracket-spacing': ['error', 'never'],
            'array-callback-return': 'error',
            'arrow-parens': ['error', 'as-needed'],
            'arrow-spacing': 'error',
            'block-scoped-var': 'error',
            'block-spacing': 'error',
            'comma-dangle': 'error',
            'comma-spacing': ['error', { before: false, after: true }],
            'comma-style': ['error', 'last'],
            'computed-property-spacing': 'error',
            'curly': ['error', 'multi-or-nest', 'consistent'],
            'dot-location': ['error', 'property'],
            'eol-last': 'error',
            'eqeqeq': 'error',
            'func-call-spacing': 'error',
            'func-name-matching': 'error',
            'func-style': ['error', 'declaration', { allowArrowFunctions: true }],
            'indent': [
                'error',
                4,
                {
                    FunctionExpression: { parameters: 2 },
                    SwitchCase: 1,
                    ignoredNodes: ['CallExpression[callee.object.name=GObject][callee.property.name=registerClass] > ClassExpression:first-child'],
                    MemberExpression: 'off'
                }
            ],
            'key-spacing': ['error', { beforeColon: false, afterColon: true }],
            'keyword-spacing': ['error', { before: true, after: true }],
            'linebreak-style': ['error', 'unix'],
            'max-nested-callbacks': 'error',
            'max-statements-per-line': ['error', { max: 2 }],
            'new-parens': 'error',
            'no-array-constructor': 'error',
            'no-await-in-loop': 'error',
            'no-caller': 'error',
            'no-constant-condition': ['error', { checkLoops: false }],
            'no-div-regex': 'error',
            'no-empty': ['error', { allowEmptyCatch: true }],
            'no-extra-bind': 'error',
            'no-extra-boolean-cast': 'off',
            'no-extra-parens': [
                'error',
                'all',
                {
                    conditionalAssign: false,
                    nestedBinaryExpressions: false,
                    returnAssign: false
                }
            ],
            'no-implicit-coercion': ['error', { allow: ['!!'] }],
            'no-iterator': 'error',
            'no-label-var': 'error',
            'no-lonely-if': 'error',
            'no-loop-func': 'error',
            'no-multiple-empty-lines': 'error',
            'no-multi-spaces': 'error',
            'no-nested-ternary': 'error',
            'no-new-object': 'error',
            'no-new-wrappers': 'error',
            'no-octal-escape': 'error',
            'no-proto': 'error',
            'no-prototype-builtins': 'off',
            'no-restricted-properties': [
                'error',
                {
                    object: 'imports',
                    property: 'format',
                    message: 'Use template strings'
                },
                {
                    object: 'pkg',
                    property: 'initFormat',
                    message: 'Use template strings'
                },
                {
                    object: 'Lang',
                    property: 'copyProperties',
                    message: 'Use Object.assign()'
                },
                {
                    object: 'Lang',
                    property: 'bind',
                    message: 'Use arrow notation or Function.prototype.bind()'
                },
                {
                    object: 'Lang',
                    property: 'Class',
                    message: 'Use ES6 classes'
                }
            ],
            'no-return-assign': 'error',
            'no-return-await': 'error',
            'no-self-compare': 'error',
            'no-shadow': 'error',
            'no-shadow-restricted-names': 'error',
            'no-tabs': 'error',
            'no-template-curly-in-string': 'error',
            'no-throw-literal': 'error',
            'no-trailing-spaces': 'error',
            'no-undef': 'error',
            'no-unneeded-ternary': 'error',
            'no-unused-vars': [
                'error',
                {
                    vars: 'local',
                    varsIgnorePattern: '(^unused|_$)',
                    argsIgnorePattern: '^(unused|_)'
                }
            ],
            'no-useless-call': 'error',
            'no-useless-computed-key': 'error',
            'no-useless-concat': 'error',
            'no-useless-constructor': 'error',
            'no-useless-rename': 'error',
            'no-useless-return': 'error',
            'no-whitespace-before-property': 'error',
            'no-with': 'error',
            'nonblock-statement-body-position': ['error', 'below'],
            'object-curly-newline': [
                'error',
                {
                    consistent: true,
                    multiline: true
                }
            ],
            'object-curly-spacing': ['error', 'always'],
            'object-shorthand': 'error',
            'operator-assignment': 'error',
            'operator-linebreak': 'error',
            'padded-blocks': ['error', 'never'],
            'prefer-numeric-literals': 'error',
            'prefer-promise-reject-errors': 'error',
            'prefer-rest-params': 'error',
            'prefer-spread': 'error',
            'prefer-template': 'error',
            'quotes': ['error', 'single', { avoidEscape: true }],
            'require-await': 'error',
            'rest-spread-spacing': 'error',
            'semi': ['error', 'always'],
            'semi-spacing': ['error', { before: false, after: true }],
            'semi-style': 'error',
            'space-before-blocks': ['error', 'always'],
            'space-before-function-paren': [
                'error',
                {
                    named: 'never',
                    anonymous: 'always',
                    asyncArrow: 'always'
                }
            ],
            'space-in-parens': 'error',
            'space-infix-ops': ['error', { int32Hint: false }],
            'space-unary-ops': 'error',
            'switch-colon-spacing': 'error',
            'symbol-description': 'error',
            'template-curly-spacing': 'error',
            'template-tag-spacing': 'error',
            'unicode-bom': 'error',
            'wrap-iife': ['error', 'inside'],
            'yield-star-spacing': 'error',
            'yoda': 'error',
            'no-console': 'off',
            'no-underscore-dangle': 'off'
        }
    }
];
