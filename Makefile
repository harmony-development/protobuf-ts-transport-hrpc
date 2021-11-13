default: generate clean build test

generate:
	buf generate git://github.com/harmony-development/hrpc.git

clean:
	@find build \( -name '*.js' -or -name '*.map' -or -name '*.ts' \) -delete;
	@find build -type d ! -path gen -delete
	@echo "'${@}' done"

build:
	@./node_modules/.bin/tsc --project tsconfig.json --module es2015 --outDir build/es2015;
	@echo "es6 done"
	@./node_modules/.bin/tsc --project tsconfig.json --module commonjs --outDir build/commonjs \
		--declaration --declarationDir build/types;
	@echo "cjs done"

test:
	@./node_modules/.bin/jest
