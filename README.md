# golang-analysis

This action runs a set of [analysis.Analyzers](https://pkg.go.dev/golang.org/x/tools/go/analysis#Analyzer) in a [multichecker](https://pkg.go.dev/golang.org/x/tools/go/analysis/multichecker) and provides annotations from the output.  Needs to be tested!

## Inputs

All inputs are optional

| Input | Type | Description | Default 
--|--|--|--
analyzers | string | semicolon delimited list of analyzers | go.sia.tech/jape.Analyzer

## Usage

Basic:
```yml
name: Test
on:
  pull_request:
    branches: [ master ]
  push:
    branches: [ master ]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-go@v3
      - uses: SiaFoundation/action-golang-analysis@v1
```

Pass command line arguments:
```yml
name: Test
on:
  pull_request:
    branches: [ master ]
  push:
    branches: [ master ]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-go@v3
      - uses: SiaFoundation/action-golang-analysis@v1
        with:
          analyzers: "go.sia.tech/jape.Analyzer"
```
