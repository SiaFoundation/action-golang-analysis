# golang-analysis

This action runs a set of [analysis.Analyzers](https://pkg.go.dev/golang.org/x/tools/go/analysis#Analyzer) in a [multichecker](https://pkg.go.dev/golang.org/x/tools/go/analysis/multichecker) and provides annotations from the output.

## Inputs

A list of `analyzers` is required.

| Input | Type | Description | Default 
--|--|--|--
analyzers | string | Multiline list of analyzers | none
directories | string | Multiline list of directories to pass to the analyzers.  If multiple directories are to be passed simultaneously, place them on the same line and separate them with a space.  | none
failOnError | bool | Whether to fail if analyzer finds errors  | true
flags | string | Flags to pass to analyzer.  Prefix each flag with its analyzer Name, i.e. japecheck.cprefix. | none

## Usage

```yml
name: Analyzer
on:
  pull_request:
    branches: [ master ]
  push:
    branches: [ master ]

jobs:
  analyzer:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-go@v3
      - uses: SiaFoundation/action-golang-analysis@HEAD
        with:
          analyzers: |
            go.sia.tech/jape.Analyzer
          directories: |
            autopilot
            bus bus/client
            worker worker/client
          flags: |
            -japecheck.cprefix="/api"
            -japecheck.types=false
```
