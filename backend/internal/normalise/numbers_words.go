package normalise

import "strconv"

func speakIntegerEN(number int) string {
	if word, ok := englishSmallNumbers[number]; ok {
		return word
	}
	if number > 31 && number < 100 {
		tens := (number / 10) * 10
		ones := number % 10
		if ones == 0 {
			return englishTens[tens]
		}
		return englishTens[tens] + " " + englishSmallNumbers[ones]
	}
	if number == 2000 {
		return "two thousand"
	}
	if number >= 2000 && number < 2100 {
		return "twenty " + speakIntegerEN(number-2000)
	}
	return strconv.Itoa(number)
}

func speakIntegerSV(number int) string {
	if word, ok := swedishSmallNumbers[number]; ok {
		return word
	}
	if number > 31 && number < 100 {
		tens := (number / 10) * 10
		ones := number % 10
		if ones == 0 {
			return swedishTens[tens]
		}
		return swedishTens[tens] + swedishSmallNumbers[ones]
	}
	if number == 2000 {
		return "tvåtusen"
	}
	if number >= 2000 && number < 2100 {
		return "tjugohundra" + speakIntegerSV(number-2000)
	}
	return strconv.Itoa(number)
}

var englishSmallNumbers = map[int]string{
	0: "zero", 1: "one", 2: "two", 3: "three", 4: "four", 5: "five",
	6: "six", 7: "seven", 8: "eight", 9: "nine", 10: "ten", 11: "eleven",
	12: "twelve", 13: "thirteen", 14: "fourteen", 15: "fifteen", 16: "sixteen",
	17: "seventeen", 18: "eighteen", 19: "nineteen", 20: "twenty", 21: "twenty one",
	22: "twenty two", 23: "twenty three", 24: "twenty four", 25: "twenty five",
	26: "twenty six", 27: "twenty seven", 28: "twenty eight", 29: "twenty nine",
	30: "thirty", 31: "thirty one",
}

var englishTens = map[int]string{
	20: "twenty",
	30: "thirty",
	40: "forty",
	50: "fifty",
	60: "sixty",
	70: "seventy",
	80: "eighty",
	90: "ninety",
}

var swedishSmallNumbers = map[int]string{
	0: "noll", 1: "ett", 2: "två", 3: "tre", 4: "fyra", 5: "fem",
	6: "sex", 7: "sju", 8: "åtta", 9: "nio", 10: "tio", 11: "elva",
	12: "tolv", 13: "tretton", 14: "fjorton", 15: "femton", 16: "sexton",
	17: "sjutton", 18: "arton", 19: "nitton", 20: "tjugo", 21: "tjugoett",
	22: "tjugotvå", 23: "tjugotre", 24: "tjugofyra", 25: "tjugofem",
	26: "tjugosex", 27: "tjugosju", 28: "tjugoåtta", 29: "tjugonio",
	30: "trettio", 31: "trettioett",
}

var swedishTens = map[int]string{
	20: "tjugo",
	30: "trettio",
	40: "fyrtio",
	50: "femtio",
	60: "sextio",
	70: "sjuttio",
	80: "åttio",
	90: "nittio",
}
