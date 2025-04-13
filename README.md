# Aangepast Online systeembord
Een aangepaste versie door Storm Buijs, oorspronkelijk van [Jeroen van Tilburg](https://github.com/jeroenvantilburg/systeembord), simuleert deze javascript-applicatie de werking het het systeembord zoals dat wordt gebruikt in de lessen natuurkunde in het voortgezet onderwijs. Met dit programma kunnen leerlingen thuis en op school oefenen met de werking van het systeembord.


## Webapp

De webapp is geschreven in HTML5 en javascript en draait in principe in Windows/MacOS/Android/iOS in iedere moderne browser. De code is nog in ontwikkeling. Als er iets niet werkt of voor verbeteringen: geef feedback.


## Beknopte instructie

- Verbindingssnoeren maken: De snoeren moeten van een uitgang naar ingang worden getrokken. Klik op een uitgang (rode cirkel) en sleep het snoer naar een (grijze) ingang.
- Meerdere verbindingssnoeren: Een uitgang kan met meerdere ingangen worden verbonden.
- Verbindingssnoeren verwijderen: Sleep het snoer weg van de ingang.
- Drukschakelaar: Met een klik-sleep kan de schakelaar worden vastgezet.
- Relais: De relais is al aangesloten op een wisselspanningbron. De zwarte uitgangen kunnen worden verbonden met de lamp of de elektrische verwarming.
- Virtuele sensoren: De LDR van de lichtsensor kan worden gesleept. De spanning is afhankelijk van de afstand tot de lamp, wanneer die aan staat. De temperatuursensor is (draadloos) verbonden met de thermometer bij de verwarming.
- Echte sensoren: De geluidsensor is aangesloten op de microfoon van de computer (je moet hiervoor wel toestemming geven).
De webcamsensor is aangesloten op de webcam van de computer (je moet hiervoor wel toestemming geven). De uitgangsspanning wordt bepaald door de helderheid van het opgenomen beeld van de webcam. Doordat de webcam automatisch de helderheid van het beeld aanpast aan de hoeveel licht komt de uitgangsspanning niet overeen met de lichtintensiteit van de omgeving.
- Voltmeter: Met de voltmeter kan de spanning op een uitgang worden gemeten. De andere ingang van de voltmeter is al verbonden met de aarde.
- Compatibiliteit: Online Syteembord werkt niet met Internet Explorer.
- Meer informatie: Zie de [handleiding](http://www.cma-science.nl/resources/nl/practicum/b0020.pdf) van het systeembord.

## Wish list

- Meer voorbeeldopstellingen

## License and credits

Deze webapp simuleert het systeembord zoals dat wordt aangeboden door [CMA Science](http://cma-science.nl/).

Deze webapp maakt veelvuldig gebruik van de [Fabric.js](http://fabricjs.com) library.

### MIT License

```Copyright (c) 2020 Jeroen van Tilburg

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
